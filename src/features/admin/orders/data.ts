import 'server-only'

import { db } from '@/lib/db'
import { type OrderStatus, type Prisma } from '@/generated/prisma/client'
import { mapOrderRow, type OrderView, type OrderRowForMapping } from '@/features/checkout/lib/order-view'

/**
 * Admin-scoped order readers — filtered/paginated list + full detail.
 * Server-only and UNGATED on purpose: every caller reaches these through the
 * `(admin)/admin` layout, which has already enforced `requireRole(ADMIN)` — same
 * trust model as `src/features/admin/data.ts`.
 *
 * Prisma reads bypass RLS (direct Postgres connection), so that layout gate is
 * the entire protection — do not export this from any ungated route.
 */

export const PAGE_SIZE = 20

export interface AdminOrderListItem {
  orderNumber: string
  placedAt: string
  email: string
  status: OrderStatus
  totalMinor: number
  currency: string
  paid: boolean
  isGift: boolean
}

export interface ListAdminOrdersInput {
  status?: OrderStatus
  query?: string
  page?: number
  /** Restrict to the refund work queue: `refundOwed: true`. AND-composes with status/query. */
  refundQueue?: boolean
}

export interface ListAdminOrdersResult {
  orders: AdminOrderListItem[]
  total: number
  page: number
  pageCount: number
}

export type AdminOrderDetail = OrderView & {
  paidAt: string | null
  paystackReference: string | null
  refundOwed: boolean
  refundedAt: string | null
  refundReference: string | null
  shippedAt: string | null
  deliveredAt: string | null
  cancelledAt: string | null
  shipbubbleOrderId: string | null
  isGift: boolean
  giftRecipientName: string | null
}

/**
 * The refund work queue's `where`: `refundOwed: true` alone. The flip that
 * records a refund sets `refundOwed` back to `false`, so the flag by itself
 * already means "owed and unrecorded" — a `refundedAt: null` co-condition
 * would additionally exclude orders that were re-flagged after an earlier
 * refund was recorded (e.g. a late chargeback), which must re-enter the
 * queue. Shared by `listAdminOrders({ refundQueue: true })` and `countRefundQueue`.
 */
const REFUND_QUEUE_WHERE: Prisma.OrderWhereInput = { refundOwed: true }

/**
 * List admin orders with optional filtering by status and search query.
 * Returns paginated results (default page size: 20).
 *
 * @param input - Optional filters: status (OrderStatus), query (search string), page (1-indexed)
 * @returns Paginated list with total count and page count
 */
export async function listAdminOrders(input: ListAdminOrdersInput = {}): Promise<ListAdminOrdersResult> {
  const { status, query, page = 1, refundQueue } = input

  // Clamp page to a minimum-1 INTEGER — a fractional page (?page=2.01 typed
  // into the URL) would otherwise produce a fractional `skip`, which Prisma
  // rejects at runtime ("Expected Int") and crash the whole list route.
  const clampedPage = Math.max(1, Math.floor(page))
  const skip = (clampedPage - 1) * PAGE_SIZE

  // Build where clause: one condition per active filter, AND-composed when
  // more than one is active. A single condition is used bare (not wrapped in
  // an `AND: [...]` of one) so the no-refund-queue, single-filter shapes stay
  // byte-for-byte identical to what they were before `refundQueue` existed.
  const conditions: Prisma.OrderWhereInput[] = []
  if (status) conditions.push({ status })
  if (query) {
    const trimmedQuery = query.trim()
    conditions.push({ OR: [{ orderNumber: trimmedQuery }, { email: { contains: trimmedQuery, mode: 'insensitive' } }] })
  }
  if (refundQueue) conditions.push(REFUND_QUEUE_WHERE)

  let where: Prisma.OrderWhereInput = {}
  if (conditions.length === 1) {
    where = conditions[0]
  } else if (conditions.length > 1) {
    where = { AND: conditions }
  }

  // Fetch orders and total count in parallel
  const [rows, total] = await Promise.all([
    db.order.findMany({
      where,
      orderBy: { placedAt: 'desc' },
      skip,
      take: PAGE_SIZE,
      select: {
        orderNumber: true,
        placedAt: true,
        email: true,
        status: true,
        totalMinor: true,
        currency: true,
        paidAt: true,
        isGift: true,
      },
    }),
    db.order.count({ where }),
  ])

  // Map to list items
  const orders: AdminOrderListItem[] = rows.map((row) => ({
    orderNumber: row.orderNumber,
    placedAt: row.placedAt.toISOString(),
    email: row.email,
    status: row.status,
    totalMinor: row.totalMinor,
    currency: row.currency,
    paid: row.paidAt !== null,
    isGift: row.isGift,
  }))

  // Calculate page count
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return {
    orders,
    total,
    page: clampedPage,
    pageCount,
  }
}

/**
 * Count of orders in the refund work queue (refund owed, not yet recorded) —
 * powers the "Refund owed" tab's badge on the orders list independent of
 * whatever filters are currently applied there.
 */
export async function countRefundQueue(): Promise<number> {
  return db.order.count({ where: REFUND_QUEUE_WHERE })
}

/**
 * Get a single admin order with full detail including fulfilment tracking.
 * Returns the order augmented with payment and fulfilment state fields.
 *
 * @param orderNumber - The order number to fetch
 * @returns Full order detail or null if not found
 */
export async function getAdminOrder(orderNumber: string): Promise<AdminOrderDetail | null> {
  const row = await db.order.findUnique({
    where: { orderNumber },
    include: { lines: true },
  })

  if (!row) return null

  // Map to OrderView using the shared mapper
  const orderView = mapOrderRow(row as OrderRowForMapping)

  // Augment with admin-specific fulfilment fields
  return {
    ...orderView,
    paidAt: row.paidAt?.toISOString() ?? null,
    paystackReference: row.paystackReference ?? null,
    refundOwed: row.refundOwed,
    refundedAt: row.refundedAt?.toISOString() ?? null,
    refundReference: row.refundReference ?? null,
    shippedAt: row.shippedAt?.toISOString() ?? null,
    deliveredAt: row.deliveredAt?.toISOString() ?? null,
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
    shipbubbleOrderId: row.shipbubbleOrderId ?? null,
    isGift: row.isGift,
    giftRecipientName: row.giftRecipientName ?? null,
  }
}
