import 'server-only'

import { db } from '@/lib/db'
import { type OrderStatus, type Prisma, type Role } from '@/generated/prisma/client'

/**
 * Admin-scoped customer readers — paginated list w/ per-currency spend, full
 * detail. Server-only and UNGATED on purpose: every caller reaches these
 * through the `(admin)/admin` layout, which has already enforced
 * `requireRole(ADMIN)` — same trust model as `src/features/admin/data.ts`
 * and `src/features/admin/orders/data.ts`.
 *
 * Prisma reads bypass RLS (direct Postgres connection), so that layout gate
 * is the entire protection — do not export this from any ungated route.
 *
 * `AdminCustomerDetail.role` is DISPLAY-ONLY: this module (and any admin UI
 * built on it) only ever reads `Profile.role`. Promoting/demoting a customer
 * is the runbook's job — a one-off `service_role` write outside the app —
 * never something reachable from here.
 */

export const CUSTOMERS_PAGE_SIZE = 20

export interface AdminCustomerListItem {
  id: string
  name: string | null
  email: string
  createdAt: string
  /** All orders regardless of status — an activity signal, distinct from `paidSpend` (the money signal). */
  orderCount: number
  /** Sum of `totalMinor` over paid orders only, per charge currency (no FX). Missing currency → 0. */
  paidSpend: { ngn: number; usd: number }
}

export interface ListCustomersInput {
  search?: string
  page?: number
}

export interface ListCustomersResult {
  customers: AdminCustomerListItem[]
  total: number
  page: number
  pageCount: number
}

export interface AdminCustomerAddress {
  id: string
  fullName: string
  line1: string
  line2: string | null
  city: string
  state: string
  country: string
  postalCode: string | null
  isDefault: boolean
}

export interface AdminCustomerOrder {
  orderNumber: string
  placedAt: string
  status: OrderStatus
  totalMinor: number
  currency: string
  paid: boolean
}

export interface AdminCustomerDetail {
  id: string
  name: string | null
  email: string
  phone: string | null
  createdAt: string
  role: Role
  addresses: AdminCustomerAddress[]
  orders: AdminCustomerOrder[]
}

/**
 * List customers with optional search over name/email.
 * Returns paginated results (default page size: 20) plus, for the returned
 * page only, per-currency paid spend.
 *
 * @param input - Optional filters: search (matches name or email, insensitive), page (1-indexed)
 * @returns Paginated list with total count and page count
 */
export async function listCustomers(input: ListCustomersInput = {}): Promise<ListCustomersResult> {
  const { search, page = 1 } = input

  // Clamp page to a minimum-1 INTEGER — a fractional page (?page=2.01 typed
  // into the URL) would otherwise produce a fractional `skip`, which Prisma
  // rejects at runtime ("Expected Int") and crash the whole list route.
  const clampedPage = Math.max(1, Math.floor(page))
  const skip = (clampedPage - 1) * CUSTOMERS_PAGE_SIZE

  let where: Prisma.ProfileWhereInput = {}
  const trimmedSearch = search?.trim()
  if (trimmedSearch) {
    where = {
      OR: [{ name: { contains: trimmedSearch, mode: 'insensitive' } }, { email: { contains: trimmedSearch, mode: 'insensitive' } }],
    }
  }

  const [rows, total] = await Promise.all([
    db.profile.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: CUSTOMERS_PAGE_SIZE,
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
        _count: { select: { orders: true } },
      },
    }),
    db.profile.count({ where }),
  ])

  // Spend without N+1: one groupBy over the current page's profile ids,
  // merged into a lookup below — mirrors getAdminMetrics's revenue idiom.
  // Skipped entirely when the page is empty; `profileId: { in: [] }` would
  // be a wasted round trip that can only return zero rows.
  const spendByProfileId = new Map<string, { ngn: number; usd: number }>()
  if (rows.length > 0) {
    const spendRows = await db.order.groupBy({
      by: ['profileId', 'currency'],
      where: { profileId: { in: rows.map((row) => row.id) }, paidAt: { not: null } },
      _sum: { totalMinor: true },
    })

    for (const row of spendRows) {
      if (!row.profileId) continue
      const entry = spendByProfileId.get(row.profileId) ?? { ngn: 0, usd: 0 }
      const sum = row._sum.totalMinor ?? 0
      if (row.currency === 'NGN') entry.ngn = sum
      else if (row.currency === 'USD') entry.usd = sum
      spendByProfileId.set(row.profileId, entry)
    }
  }

  const customers: AdminCustomerListItem[] = rows.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    createdAt: row.createdAt.toISOString(),
    orderCount: row._count.orders,
    paidSpend: spendByProfileId.get(row.id) ?? { ngn: 0, usd: 0 },
  }))

  // Calculate page count
  const pageCount = Math.max(1, Math.ceil(total / CUSTOMERS_PAGE_SIZE))

  return {
    customers,
    total,
    page: clampedPage,
    pageCount,
  }
}

/**
 * Get a single customer with full detail: saved addresses (default first,
 * then oldest first — same ordering as the account dashboard's own
 * `listAddresses`) and every order, newest first.
 *
 * @param id - The profile id (Supabase auth user id) to fetch
 * @returns Full customer detail or null if not found
 */
export async function getCustomer(id: string): Promise<AdminCustomerDetail | null> {
  const row = await db.profile.findUnique({
    where: { id },
    include: {
      addresses: { orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }] },
      orders: {
        orderBy: { placedAt: 'desc' },
        select: {
          orderNumber: true,
          placedAt: true,
          status: true,
          totalMinor: true,
          currency: true,
          paidAt: true,
        },
      },
    },
  })

  if (!row) return null

  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    createdAt: row.createdAt.toISOString(),
    role: row.role,
    addresses: row.addresses.map((address) => ({
      id: address.id,
      fullName: address.fullName,
      line1: address.line1,
      line2: address.line2,
      city: address.city,
      state: address.state,
      country: address.country,
      postalCode: address.postalCode,
      isDefault: address.isDefault,
    })),
    orders: row.orders.map((order) => ({
      orderNumber: order.orderNumber,
      placedAt: order.placedAt.toISOString(),
      status: order.status,
      totalMinor: order.totalMinor,
      currency: order.currency,
      paid: order.paidAt !== null,
    })),
  }
}
