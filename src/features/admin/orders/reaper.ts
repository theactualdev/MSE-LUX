import 'server-only'
import { db } from '@/lib/db'
import { OrderStatus } from '@/generated/prisma/client'

export const REAP_CUTOFF_HOURS = 24

/** Cancels abandoned PENDING orders (never paid, older than the cutoff) in one
 * atomic updateMany — no restock (PENDING never took stock), no refundOwed
 * (nothing was paid). markOrderPaid's status:PENDING guard makes a race with a
 * late charge safe in both directions. Ungated-by-design: callers are the
 * secret-gated cron route and the ADMIN-re-checking action. */
export async function reapAbandonedOrders(cutoffHours: number = REAP_CUTOFF_HOURS): Promise<{ ok: true; reaped: number } | { ok: false; error: 'error' }> {
  try {
    const cutoff = new Date(Date.now() - cutoffHours * 60 * 60 * 1000)
    const { count } = await db.order.updateMany({
      where: { status: OrderStatus.PENDING, paidAt: null, placedAt: { lt: cutoff } },
      data: { status: OrderStatus.CANCELLED, cancelledAt: new Date() },
    })
    return { ok: true, reaped: count }
  } catch (error) {
    console.error('[reapAbandonedOrders] unexpected error', error)
    return { ok: false, error: 'error' }
  }
}
