import { beforeEach, describe, expect, it, vi } from 'vitest'

const order = { count: vi.fn(), groupBy: vi.fn() }
const product = { count: vi.fn() }
const productVariant = { count: vi.fn() }
vi.mock('@/lib/db', () => ({
  db: {
    get order() { return order },
    get product() { return product },
    get productVariant() { return productVariant },
  },
}))

const { getAdminMetrics, LOW_STOCK_THRESHOLD } = await import('@/features/admin/data')

beforeEach(() => {
  vi.clearAllMocks()
  order.count.mockResolvedValue(0)
  order.groupBy.mockResolvedValue([])
  product.count.mockResolvedValue(0)
  productVariant.count.mockResolvedValue(0)
})

describe('getAdminMetrics', () => {
  it('counts all orders, and PROCESSING-only for awaiting fulfilment', async () => {
    order.count.mockResolvedValueOnce(12).mockResolvedValueOnce(3)

    const metrics = await getAdminMetrics()

    expect(order.count).toHaveBeenNthCalledWith(1)
    expect(order.count).toHaveBeenNthCalledWith(2, { where: { status: 'PROCESSING' } })
    expect(metrics.ordersTotal).toBe(12)
    expect(metrics.awaitingFulfilment).toBe(3)
  })

  it('sums revenue over PAID orders only, split by currency, defaulting a missing currency to 0', async () => {
    order.groupBy.mockResolvedValue([{ currency: 'NGN', _sum: { totalMinor: 1_250_000 } }])

    const metrics = await getAdminMetrics()

    expect(order.groupBy).toHaveBeenCalledWith({
      by: ['currency'],
      where: { paidAt: { not: null } },
      _sum: { totalMinor: true },
    })
    expect(metrics.revenue).toEqual({ ngn: 1_250_000, usd: 0 })
  })

  it('reports both currencies when both have paid orders, ignoring an unknown currency row and a null sum', async () => {
    order.groupBy.mockResolvedValue([
      { currency: 'NGN', _sum: { totalMinor: 500_000 } },
      { currency: 'USD', _sum: { totalMinor: 30_000 } },
      { currency: 'EUR', _sum: { totalMinor: 999 } },
      { currency: 'NGN2', _sum: { totalMinor: null } },
    ])

    const metrics = await getAdminMetrics()

    expect(metrics.revenue).toEqual({ ngn: 500_000, usd: 30_000 })
  })

  it('low stock = ACTIVE variantless products at/below threshold + variants of ACTIVE products at/below threshold', async () => {
    product.count.mockResolvedValue(2)
    productVariant.count.mockResolvedValue(3)

    const metrics = await getAdminMetrics()

    expect(product.count).toHaveBeenCalledWith({
      where: { status: 'ACTIVE', variants: { none: {} }, inventory: { lte: LOW_STOCK_THRESHOLD } },
    })
    expect(productVariant.count).toHaveBeenCalledWith({
      where: { inventory: { lte: LOW_STOCK_THRESHOLD }, product: { status: 'ACTIVE' } },
    })
    expect(metrics.lowStock).toBe(5)
  })

  it('returns all zeros on an empty store (no throw)', async () => {
    const metrics = await getAdminMetrics()
    expect(metrics).toEqual({
      ordersTotal: 0,
      awaitingFulfilment: 0,
      revenue: { ngn: 0, usd: 0 },
      lowStock: 0,
      refundsOwed: 0,
    })
  })

  it('counts refundsOwed as refund-owed, not-yet-recorded orders', async () => {
    order.count.mockResolvedValueOnce(0).mockResolvedValueOnce(0).mockResolvedValueOnce(7)

    const metrics = await getAdminMetrics()

    expect(order.count).toHaveBeenNthCalledWith(3, { where: { refundOwed: true, refundedAt: null } })
    expect(metrics.refundsOwed).toBe(7)
  })
})
