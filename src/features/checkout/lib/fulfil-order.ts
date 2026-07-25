import 'server-only'
import { db } from '@/lib/db'
import type { PaystackCharge } from '@/features/checkout/lib/paystack'

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

    await db.$transaction(async (tx) => {
      // `updateMany`, not `update`: `update`'s `where` only accepts unique
      // fields, and `paidAt` isn't unique — this is the same
      // check-and-write-in-one-statement pattern as `account/data.ts`. The
      // `paidAt: null` clause IS the concurrency guard: whichever caller's
      // `updateMany` runs first flips the row and gets `count === 1`; a
      // caller racing it (already past the `order.paidAt` check above, but
      // now losing the write) gets `count === 0`.
      const { count } = await tx.order.updateMany({
        where: { id: order.id, paidAt: null },
        data: { status: 'PROCESSING', paidAt: new Date(), paystackReference: charge.reference },
      })

      // Lost the race — another caller already won the transition and
      // applied the side effects below. Do NOT repeat them.
      if (count === 0) return

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

    return 'paid'
  } catch (error) {
    console.error('[markOrderPaid] unexpected error', error)
    return 'ignored'
  }
}
