'use server'

import { cookies } from 'next/headers'
import { db } from '@/lib/db'
import { getCurrentUserId } from '@/features/auth/claims'
import { initializeTransaction, verifyTransaction } from '@/features/checkout/lib/paystack'
import { markOrderPaid } from '@/features/checkout/lib/fulfil-order'
import { checkRateLimit, RATE_LIMITED_MESSAGE } from '@/lib/rate-limit'
import type { InitializePaymentResult, VerifyPaymentResult } from '@/features/checkout/payment-types'

/**
 * The two `'use server'` actions the checkout client calls to actually take
 * payment. Same "public HTTP endpoint" caveat as `data.ts`'s `placeOrder`:
 * both of these are directly reachable by anyone, so neither trusts a
 * caller-supplied amount or id — `initializePayment` re-derives the charge
 * amount from the stored `Order.totalMinor` (never a parameter), and
 * `verifyPayment` re-derives the charge outcome from Paystack's own
 * `verifyTransaction`, funnelling a verified success through the same
 * idempotent `markOrderPaid` the webhook uses.
 *
 * WHY `'use server'` RATHER THAN `import 'server-only'`: same reasoning as
 * `data.ts` — these need to be directly callable from the client checkout
 * flow with no separate `actions.ts` wrapper.
 *
 * Never throws out: every branch, including an unexpected Paystack/DB error,
 * resolves to `{ error }` with fixed, non-leaking copy.
 */

const ORDER_NOT_FOUND: InitializePaymentResult = { error: 'Order not found.' }
const ALREADY_PAID: InitializePaymentResult = { error: 'This order is already paid.' }
const INITIALIZE_FAILED: InitializePaymentResult = { error: 'Could not start payment. Please try again.' }

const VERIFY_FAILED: VerifyPaymentResult = { error: 'Could not confirm payment. Please try again.' }
const NOT_COMPLETED: VerifyPaymentResult = { error: 'Payment was not completed.' }
const MISMATCH: VerifyPaymentResult = { error: 'Payment could not be reconciled with your order.' }

/**
 * Both actions below share this same copy. Typed as the `{ error: string }`
 * shape common to both `InitializePaymentResult` and `VerifyPaymentResult`
 * (rather than either specific union) so the one constant stays structurally
 * assignable to both result types.
 */
const RATE_LIMITED: { error: string } = { error: RATE_LIMITED_MESSAGE }

/** A fresh, unique-per-attempt Paystack reference. Overwriting a prior failed attempt's stored reference is fine — `markOrderPaid` anchors on `orderNumber`, not this column. */
function generateReference(orderNumber: string): string {
  return `${orderNumber}-${Date.now().toString(36)}`
}

/**
 * Loads the order for `orderNumber`, scoped to the caller. A signed-in caller
 * only sees their own orders (`profileId: userId`). A guest (`userId` null)
 * has no profile, so `profileId: null` alone matches EVERY guest order — that
 * would let an anonymous caller enumerate order numbers and pay for (take
 * over) a stranger's order. So the guest path additionally requires the
 * httpOnly `mse_guest_order` cookie that `placeOrder` set to name THIS order:
 * a session-bound proof the caller is the one who placed it. Returns `null`
 * (indistinguishable from "not found") when the cookie doesn't match, so the
 * action never reveals whether an order number exists.
 */
async function loadOwnedOrder(orderNumber: string, userId: string | null) {
  if (!userId) {
    const cookieStore = await cookies()
    if (cookieStore.get('mse_guest_order')?.value !== orderNumber) return null
  }
  return db.order.findFirst({ where: { orderNumber, profileId: userId } })
}

/**
 * Creates the Paystack transaction for an already-placed PENDING order.
 * Takes ONLY `orderNumber` — there is no amount parameter, so a tampered
 * client has nothing to smuggle. The charge amount is always the order's
 * stored `totalMinor`, computed server-side back in `placeOrder`.
 */
export async function initializePayment(orderNumber: string): Promise<InitializePaymentResult> {
  if (!(await checkRateLimit('payment'))) return RATE_LIMITED

  const userId = await getCurrentUserId()
  const order = await loadOwnedOrder(orderNumber, userId)
  if (!order) return ORDER_NOT_FOUND
  if (order.paidAt) return ALREADY_PAID

  try {
    const reference = generateReference(orderNumber)

    const { accessCode } = await initializeTransaction({
      email: order.email,
      amountMinor: order.totalMinor,
      currency: order.currency as 'NGN' | 'USD',
      reference,
      metadata: { orderNumber },
    })

    await db.order.update({ where: { id: order.id }, data: { paystackReference: reference } })

    return { ok: true, accessCode, publicKey: process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY ?? '' }
  } catch (error) {
    console.error('[initializePayment] failed', error)
    return INITIALIZE_FAILED
  }
}

/**
 * The client's fast-path confirmation after the Paystack popup reports
 * success. Trusts nothing the client says beyond the `reference` — the
 * outcome is re-derived from Paystack's own `verifyTransaction`, and a
 * verified success is funnelled through `markOrderPaid`, the same
 * idempotent fulfilment core the webhook uses (the webhook is the backstop
 * if this call never lands).
 */
export async function verifyPayment(reference: string): Promise<VerifyPaymentResult> {
  // Keyed by BOTH the Paystack REFERENCE and the caller's IP, checked
  // concurrently. The reference-keyed 'payment' check is unchanged from
  // before: by the time `verifyPayment` runs, Paystack has ALREADY taken the
  // money, so a limit hit here shows "Too many attempts" for a charge that
  // already succeeded, and the only retry the UI offers creates a SECOND
  // order and a second charge — hence per-reference, not a shared bucket.
  // But `reference` is a caller-supplied argument on this public,
  // unauthenticated Server Action, and rotating it is free: a reference-only
  // key lets one host mint a fresh bucket every call and drive unbounded
  // authenticated `verifyTransaction` calls to api.paystack.co BEFORE any
  // validation. The 'verify' window is the IP-keyed backstop that closes
  // that hole — deliberately generous (60/60s) so a shared/CGNAT IP can
  // never starve a real confirmation, while still capping reference-rotation
  // abuse instead of leaving it unlimited.
  const [byReference, byIp] = await Promise.all([
    checkRateLimit('payment', reference),
    checkRateLimit('verify'),
  ])

  // A per-REFERENCE denial (`!byReference`) is the real abuse case — a caller
  // grinding one reference (or, per the comment above, minting fresh ones) —
  // and stays `RATE_LIMITED`: a real customer's own reference is essentially
  // unreachable here (10/60s against one confirmation attempt).
  //
  // An IP-only denial (`byReference && !byIp`) is different in kind, not just
  // degree: it means the per-reference check ALREADY PASSED, i.e. this is a
  // legitimate confirmation for an order Paystack has already charged. Paystack
  // took the money before this function ever ran — no charge happens on this
  // call either way — so showing a hard `RATE_LIMITED` error here is not just
  // unhelpful, it's actively dangerous: the checkout UI's only affordance on a
  // hard error is "Place order" again, which creates a SECOND order and drives
  // a SECOND Paystack charge for a customer who already paid once. Since the
  // charge already succeeded and this call would only have gone on to confirm
  // it, degrade to the same truthful `{ ok: true, status: 'processing' }` a
  // `markOrderPaid` 'ignored' result returns — "payment received, we're
  // finalising your order" — and let the webhook (the backstop for exactly
  // this case) complete fulfilment. This costs nothing on the abuse side: the
  // reference-keyed cap that actually bounds repeated confirmation attempts is
  // unchanged, and no Paystack call happens on this path regardless.
  if (!byReference) return RATE_LIMITED
  if (!byIp) return { ok: true, status: 'processing' }

  try {
    const charge = await verifyTransaction(reference)
    if (charge.status !== 'success') return NOT_COMPLETED

    const result = await markOrderPaid(charge)
    if (result === 'paid') return { ok: true, status: 'paid' }
    if (result === 'mismatch') return MISMATCH
    return { ok: true, status: 'processing' } // 'ignored' — the webhook is the backstop
  } catch (error) {
    console.error('[verifyPayment] failed', error)
    return VERIFY_FAILED
  }
}
