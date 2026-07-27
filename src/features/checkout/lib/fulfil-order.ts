import 'server-only'
import { db } from '@/lib/db'
import type { PaystackCharge } from '@/features/checkout/lib/paystack'
import { sendOrderConfirmation } from '@/features/email/send'

/**
 * The single idempotent fulfilment core. Both the Paystack webhook
 * (`api/paystack/webhook`) and the server `verifyPayment` action funnel a
 * verified `PaystackCharge` through here — never through anything else — so
 * an order is marked paid, stock decremented, and the cart cleared exactly
 * once, regardless of which caller wins a race or how many times a webhook
 * retries.
 *
 * Anchored on `orderNumber` (from Paystack metadata), NOT `reference`: a
 * retried payment attempt gets a fresh `reference` each time, so a late
 * success on an abandoned earlier reference must still resolve to the same
 * order via the stable order number.
 *
 * Never throws out — every branch, including an unexpected DB/transaction
 * error, resolves to one of the three results below so a webhook caller can
 * always respond 200 (a thrown 500 would make Paystack retry a poison event
 * forever) and a `verifyPayment` caller always gets a value to map to a
 * response.
 */
export async function markOrderPaid(charge: PaystackCharge): Promise<'paid' | 'ignored' | 'mismatch'> {
  const orderNumber = charge.metadata.orderNumber
  if (!orderNumber) return 'ignored'

  try {
    const order = await db.order.findUnique({ where: { orderNumber }, include: { lines: true } })
    if (!order) return 'ignored'

    // Idempotent no-op: the webhook fires more than once, and a `verify`
    // fast-path can race it — either way, once `paidAt` is set the order was
    // already fulfilled (by whichever caller got there first).
    if (order.paidAt) return 'paid'

    // Cross-check BEFORE the atomic transition: an amount/currency mismatch
    // means this isn't a legitimate payment for this order (under/over-pay,
    // or a tampered currency) — leave the order PENDING, never fulfil it.
    if (charge.amountMinor !== order.totalMinor || charge.currency !== order.currency) {
      console.error('[markOrderPaid] amount/currency mismatch', {
        orderNumber,
        expected: { amountMinor: order.totalMinor, currency: order.currency },
        received: { amountMinor: charge.amountMinor, currency: charge.currency },
      })
      return 'mismatch'
    }

    let lateChargeOnCancelled = false
    // Set ONLY on the genuine-fulfilment branch below (count === 1) — the
    // ONE signal that tells the code after `$transaction` resolves whether
    // THIS call actually won the guard, as opposed to short-circuiting
    // earlier (order.paidAt already set), losing a race (count === 0, no
    // cancel), or losing to a cancel (count === 0, lateChargeOnCancelled).
    // Only a `true` here may trigger the confirmation email.
    let wonFulfilment = false

    await db.$transaction(async (tx) => {
      // `updateMany`, not `update`: `update`'s `where` only accepts unique
      // fields, and `paidAt` isn't unique — this is the same
      // check-and-write-in-one-statement pattern as `account/data.ts`. The
      // `paidAt: null` clause IS the concurrency guard: whichever caller's
      // `updateMany` runs first flips the row and gets `count === 1`; a
      // caller racing it (already past the `order.paidAt` check above, but
      // now losing the write) gets `count === 0`. `status: 'PENDING'` is the
      // race fix: without it, a late payment success arriving after an admin
      // PENDING-cancel (features/admin/orders/transitions.ts) would resurrect
      // a CANCELLED order to PROCESSING and decrement stock a second time.
      const { count } = await tx.order.updateMany({
        where: { id: order.id, paidAt: null, status: 'PENDING' },
        data: { status: 'PROCESSING', paidAt: new Date(), paystackReference: charge.reference },
      })

      if (count === 0) {
        // Two ways to lose: a fulfilment race (the other caller set paidAt —
        // idempotent success), or the order was CANCELLED before this charge
        // landed (admin cancel vs. late webhook). A charge against a
        // cancelled order must NOT fulfil — record the reference and flag
        // the refund instead of resurrecting the order.
        const current = await tx.order.findUnique({ where: { id: order.id }, select: { paidAt: true, status: true } })
        if (!current?.paidAt && current?.status === 'CANCELLED') {
          await tx.order.updateMany({
            where: { id: order.id, status: 'CANCELLED' },
            data: { refundOwed: true, paystackReference: charge.reference },
          })
          lateChargeOnCancelled = true
        }
        return
      }

      wonFulfilment = true

      for (const line of order.lines) {
        if (line.variantId) {
          await tx.productVariant.update({
            where: { id: line.variantId },
            data: { inventory: { decrement: line.quantity } },
          })
        } else if (line.productId) {
          await tx.product.update({
            where: { id: line.productId },
            data: { inventory: { decrement: line.quantity } },
          })
        }
      }

      if (order.profileId) {
        await tx.cartItem.deleteMany({ where: { cart: { profileId: order.profileId } } })
      }
    })

    if (lateChargeOnCancelled) return 'mismatch'

    // Best-effort, strictly AFTER the fulfilment transaction has already
    // committed, and ONLY on the branch that actually won the guard — never
    // the already-paid short-circuit above, never a race loser, never the
    // lateChargeOnCancelled path (that order is CANCELLED; a confirmation
    // would be actively wrong). The return value below is already fixed
    // ('paid', unconditionally reached from this point) and is returned
    // unchanged regardless of what happens inside the send — its own
    // try/catch swallows and logs any failure rather than letting it
    // propagate. Same idiom as `checkout/data.ts`'s `saveAddressBestEffort`
    // call site.
    if (wonFulfilment) {
      try {
        await sendOrderConfirmation(orderNumber)
      } catch (error) {
        console.error('[markOrderPaid] sendOrderConfirmation unexpectedly threw', error)
      }
    }

    return 'paid'
  } catch (error) {
    console.error('[markOrderPaid] unexpected error', error)
    return 'ignored'
  }
}
