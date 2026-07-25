import 'server-only'
import { db } from '@/lib/db'
import { OrderStatus, ProductStatus } from '@/generated/prisma/client'

/**
 * Store-level metrics for the admin dashboard. Server-only and UNGATED on
 * purpose: every caller reaches it through the `(admin)/admin` layout, which
 * has already enforced `requireRole(ADMIN)` — same trust model as the other
 * feature `data.ts` readers that assume their route guard ran.
 *
 * Prisma reads bypass RLS (direct Postgres connection), so that layout gate
 * is the entire protection — do not export this from any ungated route.
 */

/** Inventory at or below this counts as "low stock" — tune as the catalog grows. */
export const LOW_STOCK_THRESHOLD = 3

export interface AdminMetrics {
  ordersTotal: number
  /** Paid orders not yet shipped (status PROCESSING). */
  awaitingFulfilment: number
  /** Lifetime revenue over PAID orders, in minor units, per charge currency (no FX — reported separately). */
  revenue: { ngn: number; usd: number }
  /** Sellable units at/below LOW_STOCK_THRESHOLD: variantless ACTIVE products + variants of ACTIVE products. */
  lowStock: number
}

export async function getAdminMetrics(): Promise<AdminMetrics> {
  const [ordersTotal, awaitingFulfilment, revenueRows, lowStockProducts, lowStockVariants] = await Promise.all([
    db.order.count(),
    db.order.count({ where: { status: OrderStatus.PROCESSING } }),
    db.order.groupBy({ by: ['currency'], where: { paidAt: { not: null } }, _sum: { totalMinor: true } }),
    // A variant product's own `inventory` column is unused (stock lives on the
    // variants — see schema comment), so it must not produce false lows:
    // variantless products count their own inventory, variant products count
    // each variant.
    db.product.count({ where: { status: ProductStatus.ACTIVE, variants: { none: {} }, inventory: { lte: LOW_STOCK_THRESHOLD } } }),
    db.productVariant.count({ where: { inventory: { lte: LOW_STOCK_THRESHOLD }, product: { status: ProductStatus.ACTIVE } } }),
  ])

  const revenue = { ngn: 0, usd: 0 }
  for (const row of revenueRows) {
    const sum = row._sum.totalMinor ?? 0
    if (row.currency === 'NGN') revenue.ngn = sum
    else if (row.currency === 'USD') revenue.usd = sum
  }

  return { ordersTotal, awaitingFulfilment, revenue, lowStock: lowStockProducts + lowStockVariants }
}
