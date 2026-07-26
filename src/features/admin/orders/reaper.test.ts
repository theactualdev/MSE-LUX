import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const order = {
  updateMany: vi.fn(),
}

vi.mock('@/lib/db', () => ({
  db: {
    get order() {
      return order
    },
  },
}))

const { reapAbandonedOrders, REAP_CUTOFF_HOURS } = await import('@/features/admin/orders/reaper')

const NOW = new Date('2026-07-27T12:00:00.000Z')

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  order.updateMany.mockResolvedValue({ count: 0 })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('reapAbandonedOrders', () => {
  it('REAP_CUTOFF_HOURS is 24', () => {
    expect(REAP_CUTOFF_HOURS).toBe(24)
  })

  it('default cutoff: cancels PENDING, unpaid, placed before 24h ago in one updateMany', async () => {
    order.updateMany.mockResolvedValue({ count: 3 })

    const result = await reapAbandonedOrders()

    expect(result).toEqual({ ok: true, reaped: 3 })
    expect(order.updateMany).toHaveBeenCalledWith({
      where: { status: 'PENDING', paidAt: null, placedAt: { lt: new Date('2026-07-26T12:00:00.000Z') } },
      data: { status: 'CANCELLED', cancelledAt: expect.any(Date) },
    })
    expect(order.updateMany).toHaveBeenCalledTimes(1)
  })

  it('custom cutoffHours: uses the supplied window instead of the default', async () => {
    order.updateMany.mockResolvedValue({ count: 1 })

    const result = await reapAbandonedOrders(6)

    expect(result).toEqual({ ok: true, reaped: 1 })
    expect(order.updateMany).toHaveBeenCalledWith({
      where: { status: 'PENDING', paidAt: null, placedAt: { lt: new Date('2026-07-27T06:00:00.000Z') } },
      data: { status: 'CANCELLED', cancelledAt: expect.any(Date) },
    })
  })

  it('no abandoned orders: returns reaped: 0', async () => {
    order.updateMany.mockResolvedValue({ count: 0 })

    const result = await reapAbandonedOrders()

    expect(result).toEqual({ ok: true, reaped: 0 })
  })

  it('db throws: returns ok:false, error:"error", and logs', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    order.updateMany.mockRejectedValue(new Error('db down'))

    const result = await reapAbandonedOrders()

    expect(result).toEqual({ ok: false, error: 'error' })
    expect(consoleErrorSpy).toHaveBeenCalledWith('[reapAbandonedOrders] unexpected error', expect.any(Error))
  })
})
