import 'server-only'

import { db } from '@/lib/db'

/**
 * Admin discount-code reads. Mirrors `admin/newsletter/data.ts`'s idioms,
 * including the `Math.floor` page clamp — a fractional `?page` (typed into
 * the URL) would otherwise produce a fractional Prisma `skip`, which throws
 * "Expected Int" and 500s the route (the lesson `admin/customers/data.ts`
 * records).
 */

export const DISCOUNTS_PAGE_SIZE = 50

export interface DiscountRow {
  id: string
  code: string
  percentOff: number
  active: boolean
  expiresAt: Date | null
  maxUses: number | null
  timesUsed: number
}

export async function listDiscounts(input: { page?: number } = {}): Promise<{
  discounts: DiscountRow[]
  total: number
  pageCount: number
}> {
  const page = Math.max(1, Math.floor(input.page ?? 1))

  const [discounts, total] = await Promise.all([
    db.discountCode.findMany({
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * DISCOUNTS_PAGE_SIZE,
      take: DISCOUNTS_PAGE_SIZE,
      select: {
        id: true,
        code: true,
        percentOff: true,
        active: true,
        expiresAt: true,
        maxUses: true,
        timesUsed: true,
      },
    }),
    db.discountCode.count(),
  ])

  return {
    discounts,
    total,
    pageCount: Math.max(1, Math.ceil(total / DISCOUNTS_PAGE_SIZE)),
  }
}
