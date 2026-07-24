import 'server-only'

import { db } from '@/lib/db'
import { getCurrentUserId } from '@/features/auth/claims'
import { mapOrderRow, type OrderView } from '@/features/checkout/lib/order-view'

/**
 * Per-user order reads for the customer dashboard.
 *
 * Same authorization model as `src/features/account/data.ts`: Prisma
 * connects through the pooler as a privileged role and bypasses RLS
 * entirely, so every query here derives its scope from
 * `getCurrentUserId()` (verified JWT `sub`) and takes no caller-supplied
 * user id — there is deliberately no `userId` parameter to get wrong.
 */

/** The signed-in user's orders, newest first. Empty when unauthenticated. */
export async function listOrders(): Promise<OrderView[]> {
  const userId = await getCurrentUserId()
  if (!userId) return []

  const rows = await db.order.findMany({
    where: { profileId: userId },
    orderBy: { placedAt: 'desc' },
    include: { lines: true },
  })

  return rows.map(mapOrderRow)
}

/**
 * One of the signed-in user's orders by number.
 *
 * `orderNumber` alone is not ownership — the `where` also carries
 * `profileId: userId` so a signed-in user can only ever read their own
 * orders, never another customer's by guessing/enumerating order numbers.
 * Returns `null` for not found, not owned, and unauthenticated alike, so
 * callers can't distinguish "exists but isn't yours" from "doesn't exist".
 */
export async function getOrder(orderNumber: string): Promise<OrderView | null> {
  const userId = await getCurrentUserId()
  if (!userId) return null

  const row = await db.order.findFirst({
    where: { orderNumber, profileId: userId },
    include: { lines: true },
  })

  return row ? mapOrderRow(row) : null
}
