import { beforeEach, describe, expect, it, vi } from 'vitest'

const order = { findMany: vi.fn(), count: vi.fn(), findUnique: vi.fn() }
vi.mock('@/lib/db', () => ({
  db: {
    get order() { return order },
  },
}))

const { listAdminOrders, getAdminOrder, PAGE_SIZE } = await import('@/features/admin/orders/data')

beforeEach(() => {
  vi.clearAllMocks()
  order.findMany.mockResolvedValue([])
  order.count.mockResolvedValue(0)
  order.findUnique.mockResolvedValue(null)
})

describe('listAdminOrders', () => {
  it('returns empty list when no orders exist', async () => {
    order.findMany.mockResolvedValue([])
    order.count.mockResolvedValue(0)

    const result = await listAdminOrders({})

    expect(result).toEqual({ orders: [], total: 0, page: 1, pageCount: 1 })
  })

  it('fetches with default pagination (page 1, size 20) and no filters', async () => {
    const mockOrders: Array<{
      orderNumber: string
      placedAt: Date
      email: string
      status: string
      totalMinor: number
      currency: string
      paidAt: Date
    }> = [
      {
        orderNumber: 'MSE-001',
        placedAt: new Date('2026-07-20'),
        email: 'customer@test.com',
        status: 'PROCESSING',
        totalMinor: 50000,
        currency: 'NGN',
        paidAt: new Date('2026-07-20'),
      },
    ]
    order.findMany.mockResolvedValue(mockOrders)
    order.count.mockResolvedValue(1)

    const result = await listAdminOrders({})

    expect(order.findMany).toHaveBeenCalledWith({
      where: {},
      orderBy: { placedAt: 'desc' },
      skip: 0,
      take: PAGE_SIZE,
      select: {
        orderNumber: true,
        placedAt: true,
        email: true,
        status: true,
        totalMinor: true,
        currency: true,
        paidAt: true,
      },
    })
    expect(order.count).toHaveBeenCalledWith({ where: {} })
    expect(result.total).toBe(1)
    expect(result.page).toBe(1)
    expect(result.pageCount).toBe(1)
    expect(result.orders).toHaveLength(1)
    expect(result.orders[0]).toEqual({
      orderNumber: 'MSE-001',
      placedAt: '2026-07-20T00:00:00.000Z',
      email: 'customer@test.com',
      status: 'PROCESSING',
      totalMinor: 50000,
      currency: 'NGN',
      paid: true,
    })
  })

  it('returns paid: false when paidAt is null', async () => {
    const mockOrders = [
      {
        orderNumber: 'MSE-002',
        placedAt: new Date('2026-07-20'),
        email: 'customer@test.com',
        status: 'PENDING',
        totalMinor: 50000,
        currency: 'NGN',
        paidAt: null,
      },
    ]
    order.findMany.mockResolvedValue(mockOrders)
    order.count.mockResolvedValue(1)

    const result = await listAdminOrders({})

    expect(result.orders[0].paid).toBe(false)
  })

  it('filters by status when provided', async () => {
    const mockOrders: Array<{
      orderNumber: string
      placedAt: Date
      email: string
      status: string
      totalMinor: number
      currency: string
      paidAt: Date | null
    }> = []
    order.findMany.mockResolvedValue(mockOrders)
    order.count.mockResolvedValue(0)

    await listAdminOrders({ status: 'PROCESSING' })

    expect(order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'PROCESSING' },
      })
    )
    expect(order.count).toHaveBeenCalledWith({ where: { status: 'PROCESSING' } })
  })

  it('handles pagination: page 1 skip 0, page 2 skip PAGE_SIZE, page 3 skip 2*PAGE_SIZE', async () => {
    order.findMany.mockResolvedValue([])
    order.count.mockResolvedValue(100)

    // Page 1
    await listAdminOrders({ page: 1 })
    expect(order.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ skip: 0 }))

    // Page 2
    await listAdminOrders({ page: 2 })
    expect(order.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ skip: PAGE_SIZE }))

    // Page 3
    await listAdminOrders({ page: 3 })
    expect(order.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ skip: 2 * PAGE_SIZE }))
  })

  it('clamps page to minimum 1 when page <= 0', async () => {
    order.findMany.mockResolvedValue([])
    order.count.mockResolvedValue(100)

    await listAdminOrders({ page: 0 })
    expect(order.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ skip: 0 }))

    await listAdminOrders({ page: -5 })
    expect(order.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ skip: 0 }))
  })

  it('calculates pageCount correctly', async () => {
    order.count.mockResolvedValue(1)
    order.findMany.mockResolvedValue([])

    let result = await listAdminOrders({})
    expect(result.pageCount).toBe(1) // Math.max(1, Math.ceil(1/PAGE_SIZE)) = 1

    order.count.mockResolvedValue(PAGE_SIZE)
    result = await listAdminOrders({})
    expect(result.pageCount).toBe(1) // Math.ceil(PAGE_SIZE/PAGE_SIZE) = 1

    order.count.mockResolvedValue(PAGE_SIZE + 1)
    result = await listAdminOrders({})
    expect(result.pageCount).toBe(2) // Math.ceil((PAGE_SIZE+1)/PAGE_SIZE) = 2

    order.count.mockResolvedValue(100)
    result = await listAdminOrders({})
    expect(result.pageCount).toBe(5) // Math.ceil(100/PAGE_SIZE) = 5
  })

  it('searches by order number when query is provided', async () => {
    const mockOrders: Array<{
      orderNumber: string
      placedAt: Date
      email: string
      status: string
      totalMinor: number
      currency: string
      paidAt: Date | null
    }> = []
    order.findMany.mockResolvedValue(mockOrders)
    order.count.mockResolvedValue(0)

    await listAdminOrders({ query: 'MSE-123456' })

    expect(order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [{ orderNumber: 'MSE-123456' }, { email: { contains: 'MSE-123456', mode: 'insensitive' } }],
        },
      })
    )
    expect(order.count).toHaveBeenCalledWith({
      where: {
        OR: [{ orderNumber: 'MSE-123456' }, { email: { contains: 'MSE-123456', mode: 'insensitive' } }],
      },
    })
  })

  it('trims whitespace from query string', async () => {
    const mockOrders: Array<{
      orderNumber: string
      placedAt: Date
      email: string
      status: string
      totalMinor: number
      currency: string
      paidAt: Date | null
    }> = []
    order.findMany.mockResolvedValue(mockOrders)
    order.count.mockResolvedValue(0)

    await listAdminOrders({ query: '  MSE-123456  ' })

    expect(order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [{ orderNumber: 'MSE-123456' }, { email: { contains: 'MSE-123456', mode: 'insensitive' } }],
        },
      })
    )
  })

  it('combines status and query filters with AND', async () => {
    const mockOrders: Array<{
      orderNumber: string
      placedAt: Date
      email: string
      status: string
      totalMinor: number
      currency: string
      paidAt: Date | null
    }> = []
    order.findMany.mockResolvedValue(mockOrders)
    order.count.mockResolvedValue(0)

    await listAdminOrders({ status: 'PROCESSING', query: 'MSE-123456' })

    expect(order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            { status: 'PROCESSING' },
            {
              OR: [{ orderNumber: 'MSE-123456' }, { email: { contains: 'MSE-123456', mode: 'insensitive' } }],
            },
          ],
        },
      })
    )
    expect(order.count).toHaveBeenCalledWith({
      where: {
        AND: [
          { status: 'PROCESSING' },
          {
            OR: [{ orderNumber: 'MSE-123456' }, { email: { contains: 'MSE-123456', mode: 'insensitive' } }],
          },
        ],
      },
    })
  })
})

describe('getAdminOrder', () => {
  it('returns null when order not found', async () => {
    order.findUnique.mockResolvedValue(null)

    const result = await getAdminOrder('MSE-1')

    expect(result).toBeNull()
    expect(order.findUnique).toHaveBeenCalledWith({
      where: { orderNumber: 'MSE-1' },
      include: { lines: true },
    })
  })

  it('returns full order detail with all fulfilment fields', async () => {
    const mockOrderRow = {
      orderNumber: 'MSE-1',
      email: 'test@example.com',
      status: 'PROCESSING',
      placedAt: new Date('2026-07-20'),
      shipFullName: 'John Doe',
      shipPhone: '+234123456789',
      shipLine1: '123 Main St',
      shipLine2: 'Apt 4B',
      shipCity: 'Lagos',
      shipState: 'Lagos',
      shipCountry: 'NG',
      shipPostalCode: '100001',
      shippingLabel: 'Standard',
      currency: 'NGN',
      subtotalMinor: 45000,
      shippingMinor: 2000,
      taxMinor: 3000,
      totalMinor: 50000,
      lines: [
        {
          productName: 'Gold Ring',
          variantLabel: 'Size 7',
          image: '/images/ring.jpg',
          imageAlt: 'Gold ring',
          quantity: 1,
          unitPriceMinor: 45000,
          lineTotalMinor: 45000,
        },
      ],
      trackingCarrier: 'FedEx',
      trackingNumber: 'FX123456789',
      paidAt: new Date('2026-07-20T10:30:00Z'),
      paystackReference: 'ps_ref_123456',
      refundOwed: false,
      shippedAt: new Date('2026-07-21T08:00:00Z'),
      deliveredAt: new Date('2026-07-25T14:00:00Z'),
      cancelledAt: null,
      shipbubbleOrderId: 'sb_123456',
    }
    order.findUnique.mockResolvedValue(mockOrderRow)

    const result = await getAdminOrder('MSE-1')

    expect(result).not.toBeNull()
    expect(result?.orderNumber).toBe('MSE-1')
    expect(result?.status).toBe('PROCESSING')
    expect(result?.paidAt).toBe('2026-07-20T10:30:00.000Z')
    expect(result?.paystackReference).toBe('ps_ref_123456')
    expect(result?.refundOwed).toBe(false)
    expect(result?.shippedAt).toBe('2026-07-21T08:00:00.000Z')
    expect(result?.deliveredAt).toBe('2026-07-25T14:00:00.000Z')
    expect(result?.cancelledAt).toBeNull()
    expect(result?.shipbubbleOrderId).toBe('sb_123456')
  })

  it('ISO-stringifies date fields, preserving nulls', async () => {
    const mockOrderRow = {
      orderNumber: 'MSE-2',
      email: 'test@example.com',
      status: 'PENDING',
      placedAt: new Date('2026-07-20'),
      shipFullName: 'Jane Doe',
      shipPhone: '+234987654321',
      shipLine1: '456 Oak Ave',
      shipLine2: null,
      shipCity: 'Abuja',
      shipState: 'Abuja',
      shipCountry: 'NG',
      shipPostalCode: null,
      shippingLabel: 'Standard',
      currency: 'USD',
      subtotalMinor: 10000,
      shippingMinor: 500,
      taxMinor: 1050,
      totalMinor: 11550,
      lines: [],
      trackingCarrier: null,
      trackingNumber: null,
      paidAt: null,
      paystackReference: null,
      refundOwed: false,
      shippedAt: null,
      deliveredAt: null,
      cancelledAt: null,
      shipbubbleOrderId: null,
    }
    order.findUnique.mockResolvedValue(mockOrderRow)

    const result = await getAdminOrder('MSE-2')

    expect(result?.paidAt).toBeNull()
    expect(result?.paystackReference).toBeNull()
    expect(result?.shippedAt).toBeNull()
    expect(result?.deliveredAt).toBeNull()
    expect(result?.cancelledAt).toBeNull()
    expect(result?.shipbubbleOrderId).toBeNull()
  })

  it('includes mapOrderRow fields (OrderView) in the detail', async () => {
    const mockOrderRow = {
      orderNumber: 'MSE-3',
      email: 'test@example.com',
      status: 'SHIPPED',
      placedAt: new Date('2026-07-19'),
      shipFullName: 'Bob Smith',
      shipPhone: '+234555555555',
      shipLine1: '789 Pine Rd',
      shipLine2: null,
      shipCity: 'Ibadan',
      shipState: 'Oyo',
      shipCountry: 'NG',
      shipPostalCode: '200001',
      shippingLabel: 'Express',
      currency: 'NGN',
      subtotalMinor: 80000,
      shippingMinor: 5000,
      taxMinor: 8500,
      totalMinor: 93500,
      lines: [
        {
          productName: 'Diamond Bracelet',
          variantLabel: null,
          image: '/images/bracelet.jpg',
          imageAlt: 'Diamond bracelet',
          quantity: 1,
          unitPriceMinor: 80000,
          lineTotalMinor: 80000,
        },
      ],
      trackingCarrier: 'DHL',
      trackingNumber: 'DHL987654321',
      paidAt: new Date('2026-07-19T09:15:00Z'),
      paystackReference: 'ps_ref_789012',
      refundOwed: false,
      shippedAt: new Date('2026-07-20T10:30:00Z'),
      deliveredAt: null,
      cancelledAt: null,
      shipbubbleOrderId: 'sb_789012',
    }
    order.findUnique.mockResolvedValue(mockOrderRow)

    const result = await getAdminOrder('MSE-3')

    // Check OrderView fields (from mapOrderRow)
    expect(result?.orderNumber).toBe('MSE-3')
    expect(result?.email).toBe('test@example.com')
    expect(result?.address).toBeDefined()
    expect(result?.address?.fullName).toBe('Bob Smith')
    expect(result?.shippingLabel).toBe('Express')
    expect(result?.lines).toHaveLength(1)
    expect(result?.summary).toBeDefined()
    expect(result?.placedAt).toBe('2026-07-19T00:00:00.000Z')
    expect(result?.trackingCarrier).toBe('DHL')
    expect(result?.trackingNumber).toBe('DHL987654321')

    // Check augmented admin fields
    expect(result?.paidAt).toBe('2026-07-19T09:15:00.000Z')
    expect(result?.paystackReference).toBe('ps_ref_789012')
    expect(result?.refundOwed).toBe(false)
    expect(result?.shippedAt).toBe('2026-07-20T10:30:00.000Z')
  })
})
