import 'server-only'
import { db } from '@/lib/db'
import { OrderStatus } from '@/generated/prisma/client'

/**
 * The admin order state machine. Forward-only: PROCESSING→SHIPPED→DELIVERED,
 * plus guarded cancels from PENDING (no restock — stock is only ever taken at
 * payment) and PROCESSING (restock + refundOwed; the actual refund is 8d).
 * markOrderPaid (Phase 6) remains the ONLY PENDING→PROCESSING path.
 *
 * Refunds (8d) are dashboard-first: the app never moves money. The operator
 * issues the refund directly in the Paystack dashboard, looking the payment
 * up by the order's stored `paystackReference`, then `markOrderRefunded`
 * merely records that fact against the order (`refundOwed` flips false,
 * `refundedAt`/`refundReference` are set). The guarded `updateMany` below
 * exists for the same reason as everywhere else in this file: so a
 * double-click (or two admins acting on the same order) can't double-record
 * the refund.
 *
 * Ungated by design — every caller reaches this through actions.ts, which
 * re-checks ADMIN (server actions are public endpoints; the (admin) layout
 * gate covers rendering only).
 *
 * CONCURRENCY: each transition is an atomic guarded `updateMany` whose
 * `where` carries the expected FROM status — the same idiom as
 * `markOrderPaid`'s `paidAt: null` guard. Whoever wins the write gets
 * `count === 1`; a racing caller gets `count === 0` → 'conflict' and MUST
 * perform no side effects (restock runs inside the same transaction as the
 * winning flip, so it can never run twice).
 */

export type TransitionError = 'not-found' | 'invalid-state' | 'conflict' | 'invalid-input' | 'error'
export type TransitionResult = { ok: true } | { ok: false; error: TransitionError }

export async function shipOrder(
  orderNumber: string,
  input: { carrier: string; trackingNumber: string; shipbubbleOrderId?: string },
): Promise<TransitionResult> {
  const carrier = input.carrier.trim()
  const trackingNumber = input.trackingNumber.trim()
  if (!carrier || !trackingNumber) return { ok: false, error: 'invalid-input' }

  try {
    const order = await db.order.findUnique({ where: { orderNumber }, select: { id: true, status: true } })
    if (!order) return { ok: false, error: 'not-found' }
    if (order.status !== OrderStatus.PROCESSING) return { ok: false, error: 'invalid-state' }

    const { count } = await db.order.updateMany({
      where: { id: order.id, status: OrderStatus.PROCESSING },
      data: {
        status: OrderStatus.SHIPPED,
        shippedAt: new Date(),
        trackingCarrier: carrier,
        trackingNumber,
        shipbubbleOrderId: input.shipbubbleOrderId ?? null,
      },
    })
    if (count === 0) return { ok: false, error: 'conflict' }
    return { ok: true }
  } catch (error) {
    console.error('[shipOrder] unexpected error', error)
    return { ok: false, error: 'error' }
  }
}

export async function deliverOrder(orderNumber: string): Promise<TransitionResult> {
  try {
    const order = await db.order.findUnique({ where: { orderNumber }, select: { id: true, status: true } })
    if (!order) return { ok: false, error: 'not-found' }
    if (order.status !== OrderStatus.SHIPPED) return { ok: false, error: 'invalid-state' }

    const { count } = await db.order.updateMany({
      where: { id: order.id, status: OrderStatus.SHIPPED },
      data: { status: OrderStatus.DELIVERED, deliveredAt: new Date() },
    })
    if (count === 0) return { ok: false, error: 'conflict' }
    return { ok: true }
  } catch (error) {
    console.error('[deliverOrder] unexpected error', error)
    return { ok: false, error: 'error' }
  }
}

export async function cancelOrder(orderNumber: string): Promise<TransitionResult> {
  try {
    const order = await db.order.findUnique({ where: { orderNumber }, include: { lines: true } })
    if (!order) return { ok: false, error: 'not-found' }

    if (order.status === OrderStatus.PENDING) {
      // `paidAt: null` belongs in the guard even though status is PENDING:
      // markOrderPaid flips status+paidAt in one atomic write, so requiring
      // BOTH here means a payment landing mid-cancel always beats us cleanly
      // (we conflict) — we can never cancel-without-restock a just-paid order.
      const { count } = await db.order.updateMany({
        where: { id: order.id, status: OrderStatus.PENDING, paidAt: null },
        data: { status: OrderStatus.CANCELLED, cancelledAt: new Date() },
      })
      if (count === 0) return { ok: false, error: 'conflict' }
      return { ok: true }
    }

    if (order.status === OrderStatus.PROCESSING) {
      let won = false
      await db.$transaction(async (tx) => {
        const { count } = await tx.order.updateMany({
          where: { id: order.id, status: OrderStatus.PROCESSING },
          data: { status: OrderStatus.CANCELLED, cancelledAt: new Date(), refundOwed: true },
        })
        if (count === 0) return
        won = true

        // Exact mirror of markOrderPaid's decrement: variant lines restock the
        // variant, variantless lines restock the product.
        for (const line of order.lines) {
          if (line.variantId) {
            await tx.productVariant.update({ where: { id: line.variantId }, data: { inventory: { increment: line.quantity } } })
          } else if (line.productId) {
            await tx.product.update({ where: { id: line.productId }, data: { inventory: { increment: line.quantity } } })
          }
        }
      })
      if (!won) return { ok: false, error: 'conflict' }
      return { ok: true }
    }

    return { ok: false, error: 'invalid-state' }
  } catch (error) {
    console.error('[cancelOrder] unexpected error', error)
    return { ok: false, error: 'error' }
  }
}

export async function markOrderRefunded(orderNumber: string, input: { reference?: string }): Promise<TransitionResult> {
  const refundReference = input.reference?.trim() || null

  try {
    const order = await db.order.findUnique({
      where: { orderNumber },
      select: { id: true, refundOwed: true, refundedAt: true },
    })
    if (!order) return { ok: false, error: 'not-found' }
    if (order.refundOwed !== true || order.refundedAt !== null) return { ok: false, error: 'invalid-state' }

    const { count } = await db.order.updateMany({
      where: { id: order.id, refundOwed: true, refundedAt: null },
      data: { refundOwed: false, refundedAt: new Date(), refundReference },
    })
    if (count === 0) return { ok: false, error: 'conflict' }
    return { ok: true }
  } catch (error) {
    console.error('[markOrderRefunded] unexpected error', error)
    return { ok: false, error: 'error' }
  }
}
