import { describe, it, expect, vi, beforeEach } from 'vitest'

const subscriber = vi.hoisted(() => ({ findMany: vi.fn(), count: vi.fn() }))
vi.mock('@/lib/db', () => ({ db: { subscriber } }))

const { listSubscribers, PAGE_SIZE } = await import('@/features/admin/newsletter/data')

beforeEach(() => {
  vi.clearAllMocks()
  subscriber.findMany.mockResolvedValue([])
  subscriber.count.mockResolvedValue(0)
})

describe('listSubscribers', () => {
  it('filters by status and searches by email, newest first, paginated', async () => {
    subscriber.count.mockResolvedValue(41)
    await listSubscribers({ status: 'CONFIRMED', search: 'ada', page: 2 })

    const args = subscriber.findMany.mock.calls[0][0]
    expect(args.where).toEqual({
      status: 'CONFIRMED',
      email: { contains: 'ada', mode: 'insensitive' },
    })
    expect(args.orderBy).toEqual({ createdAt: 'desc' })
    expect(args.skip).toBe(PAGE_SIZE)
    expect(args.take).toBe(PAGE_SIZE)
  })

  it('floors a fractional page before computing skip', async () => {
    subscriber.count.mockResolvedValue(0)
    await listSubscribers({ page: 2.5 })

    const args = subscriber.findMany.mock.calls[0][0]
    expect(args.skip).toBe(PAGE_SIZE)
  })

  it('returns per-status counts computed independently of the active filter', async () => {
    subscriber.count
      .mockResolvedValueOnce(10) // filtered total
      .mockResolvedValueOnce(3) // pending
      .mockResolvedValueOnce(5) // confirmed
      .mockResolvedValueOnce(2) // unsubscribed
    const result = await listSubscribers({})
    expect(result.counts).toEqual({ pending: 3, confirmed: 5, unsubscribed: 2 })
  })
})
