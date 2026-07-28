'use server'

import { cookies } from 'next/headers'
import { db } from '@/lib/db'
import { getCurrentUserId } from '@/features/auth/claims'
import { initializeTransaction, verifyTransaction } from '@/features/checkout/lib/paystack'
import { markOrderPaid } from '@/features/checkout/lib/fulfil-order'
import { checkRateLimit } from '@/lib/rate-limit'
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
 * Both actions below share the same `'payment'` rate-limit window (the
 * carding surface) and this same copy. Deliberately untyped (rather than
 * annotated as `InitializePaymentResult`/`VerifyPaymentResult`) so the one
 * constant is structurally assignable to both result unions.
 */
const RATE_LIMITED = { error: 'Too many attempts. Please wait a moment and try again.' }

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
  if (!(await checkRateLimit('payment'))) return RATE_LIMITED

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
