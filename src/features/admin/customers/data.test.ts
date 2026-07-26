import { beforeEach, describe, expect, it, vi } from 'vitest'

const profile = { findMany: vi.fn(), count: vi.fn(), findUnique: vi.fn() }
const order = { groupBy: vi.fn() }
vi.mock('@/lib/db', () => ({
  db: {
    get profile() { return profile },
    get order() { return order },
  },
}))

const { listCustomers, getCustomer, CUSTOMERS_PAGE_SIZE } = await import('@/features/admin/customers/data')

beforeEach(() => {
  vi.clearAllMocks()
  profile.findMany.mockResolvedValue([])
  profile.count.mockResolvedValue(0)
  profile.findUnique.mockResolvedValue(null)
  order.groupBy.mockResolvedValue([])
})

describe('listCustomers', () => {
  it('pages by exactly 20 rows (the PAGE_SIZE contract the symbolic assertions below rely on)', () => {
    expect(CUSTOMERS_PAGE_SIZE).toBe(20)
  })

  it('returns empty list when no customers exist, and skips the spend groupBy entirely', async () => {
    profile.findMany.mockResolvedValue([])
    profile.count.mockResolvedValue(0)

    const result = await listCustomers({})

    expect(result).toEqual({ customers: [], total: 0, page: 1, pageCount: 1 })
    expect(order.groupBy).not.toHaveBeenCalled()
  })

  it('fetches with default pagination (page 1, size 20) and no filters', async () => {
    profile.findMany.mockResolvedValue([
      {
        id: 'profile-1',
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        createdAt: new Date('2026-07-01'),
        _count: { orders: 3 },
      },
    ])
    profile.count.mockResolvedValue(1)
    order.groupBy.mockResolvedValue([])

    const result = await listCustomers({})

    expect(profile.findMany).toHaveBeenCalledWith({
      where: {},
      orderBy: { createdAt: 'desc' },
      skip: 0,
      take: CUSTOMERS_PAGE_SIZE,
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
        _count: { select: { orders: true } },
      },
    })
    expect(profile.count).toHaveBeenCalledWith({ where: {} })
    expect(result.total).toBe(1)
    expect(result.page).toBe(1)
    expect(result.pageCount).toBe(1)
    expect(result.customers).toEqual([
      {
        id: 'profile-1',
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        createdAt: '2026-07-01T00:00:00.000Z',
        orderCount: 3,
        paidSpend: { ngn: 0, usd: 0 },
      },
    ])
  })

  it('fetches spend in ONE groupBy call scoped to the page ids, merging per-currency sums per profile', async () => {
    profile.findMany.mockResolvedValue([
      { id: 'profile-1', name: 'Ada', email: 'ada@example.com', createdAt: new Date('2026-07-01'), _count: { orders: 2 } },
      { id: 'profile-2', name: 'Bo', email: 'bo@example.com', createdAt: new Date('2026-06-01'), _count: { orders: 0 } },
    ])
    profile.count.mockResolvedValue(2)
    order.groupBy.mockResolvedValue([
      { profileId: 'profile-1', currency: 'NGN', _sum: { totalMinor: 500_000 } },
      { profileId: 'profile-1', currency: 'USD', _sum: { totalMinor: 2_000 } },
      // profile-2 has no paid orders at all -> should default to { ngn: 0, usd: 0 }
    ])

    const result = await listCustomers({})

    expect(order.groupBy).toHaveBeenCalledTimes(1)
    expect(order.groupBy).toHaveBeenCalledWith({
      by: ['profileId', 'currency'],
      where: { profileId: { in: ['profile-1', 'profile-2'] }, paidAt: { not: null } },
      _sum: { totalMinor: true },
    })
    expect(result.customers[0].paidSpend).toEqual({ ngn: 500_000, usd: 2_000 })
    expect(result.customers[1].paidSpend).toEqual({ ngn: 0, usd: 0 })
  })

  it('ignores unknown currencies and a null sum when merging spend', async () => {
    profile.findMany.mockResolvedValue([
      { id: 'profile-1', name: 'Ada', email: 'ada@example.com', createdAt: new Date('2026-07-01'), _count: { orders: 1 } },
    ])
    profile.count.mockResolvedValue(1)
    order.groupBy.mockResolvedValue([
      { profileId: 'profile-1', currency: 'NGN', _sum: { totalMinor: 100 } },
      { profileId: 'profile-1', currency: 'EUR', _sum: { totalMinor: 999 } },
      { profileId: 'profile-1', currency: 'GBP', _sum: { totalMinor: null } },
    ])

    const result = await listCustomers({})

    expect(result.customers[0].paidSpend).toEqual({ ngn: 100, usd: 0 })
  })

  it('searches by name or email (case-insensitive), trimmed', async () => {
    await listCustomers({ search: '  ada  ' })

    expect(profile.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [{ name: { contains: 'ada', mode: 'insensitive' } }, { email: { contains: 'ada', mode: 'insensitive' } }],
        },
      })
    )
    expect(profile.count).toHaveBeenCalledWith({
      where: {
        OR: [{ name: { contains: 'ada', mode: 'insensitive' } }, { email: { contains: 'ada', mode: 'insensitive' } }],
      },
    })
  })

  it('treats a blank/whitespace-only search as no filter', async () => {
    await listCustomers({ search: '   ' })

    expect(profile.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {} }))
  })

  it('handles pagination: page 1 skip 0, page 2 skip PAGE_SIZE, page 3 skip 2*PAGE_SIZE', async () => {
    profile.count.mockResolvedValue(100)

    await listCustomers({ page: 1 })
    expect(profile.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ skip: 0 }))

    await listCustomers({ page: 2 })
    expect(profile.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ skip: CUSTOMERS_PAGE_SIZE }))

    await listCustomers({ page: 3 })
    expect(profile.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ skip: 2 * CUSTOMERS_PAGE_SIZE }))
  })

  it('clamps page to a minimum-1 integer for non-positive and fractional input', async () => {
    profile.count.mockResolvedValue(100)

    await listCustomers({ page: 0 })
    expect(profile.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ skip: 0 }))

    await listCustomers({ page: -5 })
    expect(profile.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ skip: 0 }))

    await listCustomers({ page: 2.9 })
    expect(profile.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ skip: CUSTOMERS_PAGE_SIZE }))
  })

  it('calculates pageCount correctly', async () => {
    profile.count.mockResolvedValue(1)
    let result = await listCustomers({})
    expect(result.pageCount).toBe(1)

    profile.count.mockResolvedValue(CUSTOMERS_PAGE_SIZE)
    result = await listCustomers({})
    expect(result.pageCount).toBe(1)

    profile.count.mockResolvedValue(CUSTOMERS_PAGE_SIZE + 1)
    result = await listCustomers({})
    expect(result.pageCount).toBe(2)

    profile.count.mockResolvedValue(100)
    result = await listCustomers({})
    expect(result.pageCount).toBe(5)
  })
})

describe('getCustomer', () => {
  it('returns null when not found', async () => {
    profile.findUnique.mockResolvedValue(null)

    const result = await getCustomer('missing-id')

    expect(result).toBeNull()
    expect(profile.findUnique).toHaveBeenCalledWith({
      where: { id: 'missing-id' },
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
  })

  it('returns full detail: role passthrough, ISO dates, addresses and orders mapped', async () => {
    profile.findUnique.mockResolvedValue({
      id: 'profile-1',
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      phone: '+2348012345678',
      createdAt: new Date('2026-01-15'),
      role: 'ADMIN',
      addresses: [
        {
          id: 'addr-1',
          fullName: 'Ada Lovelace',
          phone: '+2348012345678',
          line1: '1 Analytical Engine Way',
          line2: null,
          city: 'Lagos',
          state: 'Lagos',
          country: 'NG',
          postalCode: '100001',
          isDefault: true,
        },
      ],
      orders: [
        {
          orderNumber: 'MSE-002',
          placedAt: new Date('2026-07-10'),
          status: 'PROCESSING',
          totalMinor: 20000,
          currency: 'NGN',
          paidAt: new Date('2026-07-10T10:00:00Z'),
        },
        {
          orderNumber: 'MSE-001',
          placedAt: new Date('2026-06-01'),
          status: 'PENDING',
          totalMinor: 10000,
          currency: 'NGN',
          paidAt: null,
        },
      ],
    })

    const result = await getCustomer('profile-1')

    expect(result).toEqual({
      id: 'profile-1',
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      phone: '+2348012345678',
      createdAt: '2026-01-15T00:00:00.000Z',
      role: 'ADMIN',
      addresses: [
        {
          id: 'addr-1',
          fullName: 'Ada Lovelace',
          line1: '1 Analytical Engine Way',
          line2: null,
          city: 'Lagos',
          state: 'Lagos',
          country: 'NG',
          postalCode: '100001',
          isDefault: true,
        },
      ],
      orders: [
        {
          orderNumber: 'MSE-002',
          placedAt: '2026-07-10T00:00:00.000Z',
          status: 'PROCESSING',
          totalMinor: 20000,
          currency: 'NGN',
          paid: true,
        },
        {
          orderNumber: 'MSE-001',
          placedAt: '2026-06-01T00:00:00.000Z',
          status: 'PENDING',
          totalMinor: 10000,
          currency: 'NGN',
          paid: false,
        },
      ],
    })
  })

  it('preserves nulls for name and phone', async () => {
    profile.findUnique.mockResolvedValue({
      id: 'profile-2',
      name: null,
      email: 'noname@example.com',
      phone: null,
      createdAt: new Date('2026-02-01'),
      role: 'CUSTOMER',
      addresses: [],
      orders: [],
    })

    const result = await getCustomer('profile-2')

    expect(result?.name).toBeNull()
    expect(result?.phone).toBeNull()
    expect(result?.addresses).toEqual([])
    expect(result?.orders).toEqual([])
  })
})
