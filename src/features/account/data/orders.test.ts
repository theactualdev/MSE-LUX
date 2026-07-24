import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { OrderRowForMapping } from '@/features/checkout/lib/order-view'

/**
 * Same rationale as `account/data.test.ts`: Prisma bypasses RLS, so
 * authorization lives entirely in this module's query scoping. Assertions
 * below check the *arguments* Prisma is called with — a function that
 * returned the right shape while forgetting `profileId` in its `where`
 * would be a cross-tenant read, and only an argument assertion catches
 * that.
 */

const order = {
  findMany: vi.fn(),
  findFirst: vi.fn(),
}

vi.mock('@/lib/db', () => ({
  db: {
    get order() {
      return order
    },
  },
}))

const getCurrentUserId = vi.fn()

vi.mock('@/features/auth/claims', () => ({
  getCurrentUserId: () => getCurrentUserId(),
}))

const { listOrders, getOrder } = await import('@/features/account/data/orders')

const USER_ID = '11111111-1111-4111-8111-111111111111'

function buildRow(overrides: Partial<OrderRowForMapping> = {}): OrderRowForMapping {
  return {
    orderNumber: 'MSE-100001',
    email: 'jane@example.com',
    status: 'PROCESSING',
    placedAt: new Date('2026-07-24T10:00:00.000Z'),
    shipFullName: 'Jane Doe',
    shipPhone: '+1 555 123 4567',
    shipLine1: '123 Main St',
    shipLine2: null,
    shipCity: 'New York',
    shipState: 'NY',
    shipCountry: 'US',
    shipPostalCode: '10001',
    shippingLabel: 'Standard Shipping',
    currency: 'USD',
    subtotalMinor: 2900,
    shippingMinor: 500,
    taxMinor: 232,
    totalMinor: 3632,
    lines: [
      {
        productName: 'Gold Hoop Earrings',
        variantLabel: null,
        image: null,
        imageAlt: null,
        quantity: 1,
        unitPriceMinor: 2900,
        lineTotalMinor: 2900,
      },
    ],
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  getCurrentUserId.mockResolvedValue(USER_ID)
})

describe('listOrders', () => {
  it('scopes the query to the session user, orders newest first, includes lines, and maps each row', async () => {
    const row = buildRow()
    order.findMany.mockResolvedValue([row])

    const result = await listOrders()

    expect(order.findMany).toHaveBeenCalledWith({
      where: { profileId: USER_ID },
      orderBy: { placedAt: 'desc' },
      include: { lines: true },
    })
    // Not re-implementing mapOrderRow's assertions here (order-view.test.ts
    // owns those) — just confirming the real mapper actually ran on the row.
    expect(result).toHaveLength(1)
    expect(result[0].orderNumber).toBe('MSE-100001')
    expect(result[0].status).toBe('PROCESSING')
    expect(result[0].lines[0].unitPrice).toEqual({ amountMinor: 2900, currency: 'USD' })
    expect(result[0].summary.total).toEqual({ amountMinor: 3632, currency: 'USD' })
  })

  it('returns an empty list without touching the database when unauthenticated', async () => {
    getCurrentUserId.mockResolvedValue(null)

    await expect(listOrders()).resolves.toEqual([])
    expect(order.findMany).not.toHaveBeenCalled()
  })
})

describe('getOrder', () => {
  it('filters by BOTH the order number and the session user id, includes lines, and returns the mapped view', async () => {
    const row = buildRow()
    order.findFirst.mockResolvedValue(row)

    const result = await getOrder('MSE-100001')

    expect(order.findFirst).toHaveBeenCalledWith({
      where: { orderNumber: 'MSE-100001', profileId: USER_ID },
      include: { lines: true },
    })
    expect(result).not.toBeNull()
    expect(result?.orderNumber).toBe('MSE-100001')
    expect(result?.email).toBe('jane@example.com')
  })

  it('returns null when the order does not exist or belongs to somebody else', async () => {
    order.findFirst.mockResolvedValue(null)

    await expect(getOrder('MSE-999999')).resolves.toBeNull()
  })

  it('returns null without touching the database when unauthenticated', async () => {
    getCurrentUserId.mockResolvedValue(null)

    await expect(getOrder('MSE-100001')).resolves.toBeNull()
    expect(order.findFirst).not.toHaveBeenCalled()
  })
})
