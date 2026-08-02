import { describe, it, expect, vi, beforeEach } from 'vitest'

const discountCode = vi.hoisted(() => ({ findMany: vi.fn(), count: vi.fn() }))
vi.mock('@/lib/db', () => ({ db: { discountCode } }))

const { listDiscounts, DISCOUNTS_PAGE_SIZE } = await import('@/features/admin/discounts/data')

beforeEach(() => {
  vi.clearAllMocks()
  discountCode.findMany.mockResolvedValue([])
  discountCode.count.mockResolvedValue(0)
})

describe('listDiscounts', () => {
  it('lists newest first, paginated at the shared page size', async () => {
    discountCode.count.mockResolvedValue(120)
    await listDiscounts({ page: 2 })

    const args = discountCode.findMany.mock.calls[0][0]
    expect(args.orderBy).toEqual({ createdAt: 'desc' })
    expect(args.skip).toBe(DISCOUNTS_PAGE_SIZE)
    expect(args.take).toBe(DISCOUNTS_PAGE_SIZE)
  })

  it('floors a fractional page before computing skip', async () => {
    discountCode.count.mockResolvedValue(0)
    await listDiscounts({ page: 2.9 })

    const args = discountCode.findMany.mock.calls[0][0]
    expect(args.skip).toBe(DISCOUNTS_PAGE_SIZE)
  })

  it('clamps a page below 1 to page 1', async () => {
    discountCode.count.mockResolvedValue(0)
    await listDiscounts({ page: 0 })

    const args = discountCode.findMany.mock.calls[0][0]
    expect(args.skip).toBe(0)
  })

  it('defaults to page 1 when no page is given', async () => {
    discountCode.count.mockResolvedValue(0)
    await listDiscounts({})

    const args = discountCode.findMany.mock.calls[0][0]
    expect(args.skip).toBe(0)
  })

  it('computes pageCount from total, minimum 1', async () => {
    discountCode.count.mockResolvedValue(0)
    const result = await listDiscounts({})
    expect(result.pageCount).toBe(1)
    expect(result.total).toBe(0)
  })

  it('returns the rows and total verbatim', async () => {
    const rows = [
      { id: 'd1', code: 'LAUNCH20', percentOff: 20, active: true, expiresAt: null, maxUses: null, timesUsed: 3 },
    ]
    discountCode.findMany.mockResolvedValue(rows)
    discountCode.count.mockResolvedValue(1)

    const result = await listDiscounts({})
    expect(result.discounts).toEqual(rows)
    expect(result.total).toBe(1)
  })
})
