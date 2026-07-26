import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Role } from '@/generated/prisma/client'

const getCurrentRole = vi.fn()
const roleSatisfies = vi.fn()
vi.mock('@/features/auth/claims', () => ({
  getCurrentRole: (...args: []) => getCurrentRole(...args),
  roleSatisfies: (...args: [unknown, unknown]) => roleSatisfies(...args),
}))

const shipOrder = vi.fn()
const deliverOrder = vi.fn()
const cancelOrder = vi.fn()
const markOrderRefunded = vi.fn()
vi.mock('@/features/admin/orders/transitions', () => ({
  shipOrder: (...args: [string, unknown]) => shipOrder(...args),
  deliverOrder: (...args: [string]) => deliverOrder(...args),
  cancelOrder: (...args: [string]) => cancelOrder(...args),
  markOrderRefunded: (...args: [string, unknown]) => markOrderRefunded(...args),
}))

const getBookingRates = vi.fn()
const bookShipment = vi.fn()
vi.mock('@/features/admin/orders/booking', () => ({
  getBookingRates: (...args: [string]) => getBookingRates(...args),
  bookShipment: (...args: [string, unknown]) => bookShipment(...args),
}))

const revalidatePath = vi.fn()
vi.mock('next/cache', () => ({
  revalidatePath: (...args: [string]) => revalidatePath(...args),
}))

const {
  shipOrderAction,
  deliverOrderAction,
  cancelOrderAction,
  markOrderRefundedAction,
  getBookingRatesAction,
  bookShipmentAction,
} = await import('@/features/admin/orders/actions')

const ORDER_NUMBER = 'MSE-000123'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('shipOrderAction', () => {
  it('CUSTOMER role returns forbidden and never calls shipOrder', async () => {
    getCurrentRole.mockResolvedValue(Role.CUSTOMER)
    roleSatisfies.mockReturnValue(false)

    const result = await shipOrderAction(ORDER_NUMBER, { carrier: 'FedEx', trackingNumber: 'TRK-123' })

    expect(result).toEqual({ ok: false, error: 'forbidden' })
    expect(shipOrder).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('ADMIN role delegates with exact args', async () => {
    getCurrentRole.mockResolvedValue(Role.ADMIN)
    roleSatisfies.mockReturnValue(true)
    shipOrder.mockResolvedValue({ ok: true })

    const input = { carrier: 'FedEx', trackingNumber: 'TRK-123' }
    const result = await shipOrderAction(ORDER_NUMBER, input)

    expect(result).toEqual({ ok: true })
    expect(shipOrder).toHaveBeenCalledWith(ORDER_NUMBER, input)
    expect(shipOrder).toHaveBeenCalledTimes(1)
  })

  it('ADMIN role on ok:true revalidates both paths', async () => {
    getCurrentRole.mockResolvedValue(Role.ADMIN)
    roleSatisfies.mockReturnValue(true)
    shipOrder.mockResolvedValue({ ok: true })

    await shipOrderAction(ORDER_NUMBER, { carrier: 'FedEx', trackingNumber: 'TRK-123' })

    expect(revalidatePath).toHaveBeenCalledWith('/admin/orders')
    expect(revalidatePath).toHaveBeenCalledWith(`/admin/orders/${ORDER_NUMBER}`)
    expect(revalidatePath).toHaveBeenCalledTimes(2)
  })

  it('ADMIN role on ok:false does not revalidate', async () => {
    getCurrentRole.mockResolvedValue(Role.ADMIN)
    roleSatisfies.mockReturnValue(true)
    shipOrder.mockResolvedValue({ ok: false, error: 'not-found' })

    const result = await shipOrderAction(ORDER_NUMBER, { carrier: 'FedEx', trackingNumber: 'TRK-123' })

    expect(result).toEqual({ ok: false, error: 'not-found' })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('ADMIN role returns delegate result verbatim on error', async () => {
    getCurrentRole.mockResolvedValue(Role.ADMIN)
    roleSatisfies.mockReturnValue(true)
    shipOrder.mockResolvedValue({ ok: false, error: 'conflict' })

    const result = await shipOrderAction(ORDER_NUMBER, { carrier: 'FedEx', trackingNumber: 'TRK-123' })

    expect(result).toEqual({ ok: false, error: 'conflict' })
  })
})

describe('deliverOrderAction', () => {
  it('CUSTOMER role returns forbidden and never calls deliverOrder', async () => {
    getCurrentRole.mockResolvedValue(Role.CUSTOMER)
    roleSatisfies.mockReturnValue(false)

    const result = await deliverOrderAction(ORDER_NUMBER)

    expect(result).toEqual({ ok: false, error: 'forbidden' })
    expect(deliverOrder).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('ADMIN role delegates with exact args', async () => {
    getCurrentRole.mockResolvedValue(Role.ADMIN)
    roleSatisfies.mockReturnValue(true)
    deliverOrder.mockResolvedValue({ ok: true })

    const result = await deliverOrderAction(ORDER_NUMBER)

    expect(result).toEqual({ ok: true })
    expect(deliverOrder).toHaveBeenCalledWith(ORDER_NUMBER)
    expect(deliverOrder).toHaveBeenCalledTimes(1)
  })

  it('ADMIN role on ok:true revalidates both paths', async () => {
    getCurrentRole.mockResolvedValue(Role.ADMIN)
    roleSatisfies.mockReturnValue(true)
    deliverOrder.mockResolvedValue({ ok: true })

    await deliverOrderAction(ORDER_NUMBER)

    expect(revalidatePath).toHaveBeenCalledWith('/admin/orders')
    expect(revalidatePath).toHaveBeenCalledWith(`/admin/orders/${ORDER_NUMBER}`)
    expect(revalidatePath).toHaveBeenCalledTimes(2)
  })

  it('ADMIN role on ok:false does not revalidate', async () => {
    getCurrentRole.mockResolvedValue(Role.ADMIN)
    roleSatisfies.mockReturnValue(true)
    deliverOrder.mockResolvedValue({ ok: false, error: 'invalid-state' })

    const result = await deliverOrderAction(ORDER_NUMBER)

    expect(result).toEqual({ ok: false, error: 'invalid-state' })
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})

describe('cancelOrderAction', () => {
  it('CUSTOMER role returns forbidden and never calls cancelOrder', async () => {
    getCurrentRole.mockResolvedValue(Role.CUSTOMER)
    roleSatisfies.mockReturnValue(false)

    const result = await cancelOrderAction(ORDER_NUMBER)

    expect(result).toEqual({ ok: false, error: 'forbidden' })
    expect(cancelOrder).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('ADMIN role delegates with exact args', async () => {
    getCurrentRole.mockResolvedValue(Role.ADMIN)
    roleSatisfies.mockReturnValue(true)
    cancelOrder.mockResolvedValue({ ok: true })

    const result = await cancelOrderAction(ORDER_NUMBER)

    expect(result).toEqual({ ok: true })
    expect(cancelOrder).toHaveBeenCalledWith(ORDER_NUMBER)
    expect(cancelOrder).toHaveBeenCalledTimes(1)
  })

  it('ADMIN role on ok:true revalidates both paths', async () => {
    getCurrentRole.mockResolvedValue(Role.ADMIN)
    roleSatisfies.mockReturnValue(true)
    cancelOrder.mockResolvedValue({ ok: true })

    await cancelOrderAction(ORDER_NUMBER)

    expect(revalidatePath).toHaveBeenCalledWith('/admin/orders')
    expect(revalidatePath).toHaveBeenCalledWith(`/admin/orders/${ORDER_NUMBER}`)
    expect(revalidatePath).toHaveBeenCalledTimes(2)
  })

  it('ADMIN role on ok:false does not revalidate', async () => {
    getCurrentRole.mockResolvedValue(Role.ADMIN)
    roleSatisfies.mockReturnValue(true)
    cancelOrder.mockResolvedValue({ ok: false, error: 'conflict' })

    const result = await cancelOrderAction(ORDER_NUMBER)

    expect(result).toEqual({ ok: false, error: 'conflict' })
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})

describe('markOrderRefundedAction', () => {
  it('CUSTOMER role returns forbidden and never calls markOrderRefunded', async () => {
    getCurrentRole.mockResolvedValue(Role.CUSTOMER)
    roleSatisfies.mockReturnValue(false)

    const result = await markOrderRefundedAction(ORDER_NUMBER, {})

    expect(result).toEqual({ ok: false, error: 'forbidden' })
    expect(markOrderRefunded).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('ADMIN role delegates with exact args', async () => {
    getCurrentRole.mockResolvedValue(Role.ADMIN)
    roleSatisfies.mockReturnValue(true)
    markOrderRefunded.mockResolvedValue({ ok: true })

    const input = { reference: 'RF-1' }
    const result = await markOrderRefundedAction(ORDER_NUMBER, input)

    expect(result).toEqual({ ok: true })
    expect(markOrderRefunded).toHaveBeenCalledWith(ORDER_NUMBER, input)
    expect(markOrderRefunded).toHaveBeenCalledTimes(1)
  })

  it('ADMIN role on ok:true revalidates both admin order paths only', async () => {
    getCurrentRole.mockResolvedValue(Role.ADMIN)
    roleSatisfies.mockReturnValue(true)
    markOrderRefunded.mockResolvedValue({ ok: true })

    await markOrderRefundedAction(ORDER_NUMBER, {})

    expect(revalidatePath).toHaveBeenCalledWith('/admin/orders')
    expect(revalidatePath).toHaveBeenCalledWith(`/admin/orders/${ORDER_NUMBER}`)
    expect(revalidatePath).toHaveBeenCalledTimes(2)
  })

  it('ADMIN role on ok:false does not revalidate', async () => {
    getCurrentRole.mockResolvedValue(Role.ADMIN)
    roleSatisfies.mockReturnValue(true)
    markOrderRefunded.mockResolvedValue({ ok: false, error: 'invalid-state' })

    const result = await markOrderRefundedAction(ORDER_NUMBER, {})

    expect(result).toEqual({ ok: false, error: 'invalid-state' })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('ADMIN role returns delegate result verbatim on conflict', async () => {
    getCurrentRole.mockResolvedValue(Role.ADMIN)
    roleSatisfies.mockReturnValue(true)
    markOrderRefunded.mockResolvedValue({ ok: false, error: 'conflict' })

    const result = await markOrderRefundedAction(ORDER_NUMBER, {})

    expect(result).toEqual({ ok: false, error: 'conflict' })
  })
})

describe('getBookingRatesAction', () => {
  it('CUSTOMER role returns forbidden and never calls getBookingRates', async () => {
    getCurrentRole.mockResolvedValue(Role.CUSTOMER)
    roleSatisfies.mockReturnValue(false)

    const result = await getBookingRatesAction(ORDER_NUMBER)

    expect(result).toEqual({ ok: false, error: 'forbidden' })
    expect(getBookingRates).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('ADMIN role delegates with exact args', async () => {
    getCurrentRole.mockResolvedValue(Role.ADMIN)
    roleSatisfies.mockReturnValue(true)
    const ratesResult = {
      ok: true,
      requestToken: 'tok-1',
      rates: [],
      paidShipping: { amountMinor: 100, currency: 'NGN', label: 'Standard' },
    }
    getBookingRates.mockResolvedValue(ratesResult)

    const result = await getBookingRatesAction(ORDER_NUMBER)

    expect(result).toEqual(ratesResult)
    expect(getBookingRates).toHaveBeenCalledWith(ORDER_NUMBER)
    expect(getBookingRates).toHaveBeenCalledTimes(1)
  })

  it('ADMIN role never revalidates on ok:true (read operation)', async () => {
    getCurrentRole.mockResolvedValue(Role.ADMIN)
    roleSatisfies.mockReturnValue(true)
    getBookingRates.mockResolvedValue({
      ok: true,
      requestToken: 'tok-1',
      rates: [],
      paidShipping: { amountMinor: 100, currency: 'NGN', label: 'Standard' },
    })

    await getBookingRatesAction(ORDER_NUMBER)

    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('ADMIN role never revalidates on ok:false', async () => {
    getCurrentRole.mockResolvedValue(Role.ADMIN)
    roleSatisfies.mockReturnValue(true)
    getBookingRates.mockResolvedValue({ ok: false, error: 'not-found' })

    await getBookingRatesAction(ORDER_NUMBER)

    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('ADMIN role returns delegate result verbatim', async () => {
    getCurrentRole.mockResolvedValue(Role.ADMIN)
    roleSatisfies.mockReturnValue(true)
    getBookingRates.mockResolvedValue({ ok: false, error: 'not-nigeria' })

    const result = await getBookingRatesAction(ORDER_NUMBER)

    expect(result).toEqual({ ok: false, error: 'not-nigeria' })
  })
})

describe('bookShipmentAction', () => {
  const BOOK_INPUT = { requestToken: 'tok-1', courierId: 'c-1', serviceCode: 'svc-1' }

  it('CUSTOMER role returns forbidden and never calls bookShipment', async () => {
    getCurrentRole.mockResolvedValue(Role.CUSTOMER)
    roleSatisfies.mockReturnValue(false)

    const result = await bookShipmentAction(ORDER_NUMBER, BOOK_INPUT)

    expect(result).toEqual({ ok: false, error: 'forbidden' })
    expect(bookShipment).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('ADMIN role delegates with exact args', async () => {
    getCurrentRole.mockResolvedValue(Role.ADMIN)
    roleSatisfies.mockReturnValue(true)
    bookShipment.mockResolvedValue({ ok: true })

    const result = await bookShipmentAction(ORDER_NUMBER, BOOK_INPUT)

    expect(result).toEqual({ ok: true })
    expect(bookShipment).toHaveBeenCalledWith(ORDER_NUMBER, BOOK_INPUT)
    expect(bookShipment).toHaveBeenCalledTimes(1)
  })

  it('ADMIN role on ok:true revalidates both paths', async () => {
    getCurrentRole.mockResolvedValue(Role.ADMIN)
    roleSatisfies.mockReturnValue(true)
    bookShipment.mockResolvedValue({ ok: true })

    await bookShipmentAction(ORDER_NUMBER, BOOK_INPUT)

    expect(revalidatePath).toHaveBeenCalledWith('/admin/orders')
    expect(revalidatePath).toHaveBeenCalledWith(`/admin/orders/${ORDER_NUMBER}`)
    expect(revalidatePath).toHaveBeenCalledTimes(2)
  })

  it('ADMIN role on ok:false does not revalidate', async () => {
    getCurrentRole.mockResolvedValue(Role.ADMIN)
    roleSatisfies.mockReturnValue(true)
    bookShipment.mockResolvedValue({ ok: false, error: 'invalid-input' })

    const result = await bookShipmentAction(ORDER_NUMBER, BOOK_INPUT)

    expect(result).toEqual({ ok: false, error: 'invalid-input' })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('ADMIN role returns delegate result verbatim on error', async () => {
    getCurrentRole.mockResolvedValue(Role.ADMIN)
    roleSatisfies.mockReturnValue(true)
    bookShipment.mockResolvedValue({
      ok: false,
      error: 'conflict',
      shipbubbleOrderId: 'SB-ORD-1',
    })

    const result = await bookShipmentAction(ORDER_NUMBER, BOOK_INPUT)

    expect(result).toEqual({
      ok: false,
      error: 'conflict',
      shipbubbleOrderId: 'SB-ORD-1',
    })
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})

describe('role-check ordering', () => {
  it('role check happens before any engine call (shipOrderAction)', async () => {
    getCurrentRole.mockResolvedValue(Role.CUSTOMER)
    roleSatisfies.mockReturnValue(false)
    shipOrder.mockResolvedValue({ ok: true })

    await shipOrderAction(ORDER_NUMBER, { carrier: 'FedEx', trackingNumber: 'TRK-123' })

    expect(roleSatisfies).toHaveBeenCalled()
    expect(shipOrder).not.toHaveBeenCalled()
  })

  it('role check happens before any engine call (bookShipmentAction)', async () => {
    getCurrentRole.mockResolvedValue(Role.CUSTOMER)
    roleSatisfies.mockReturnValue(false)
    bookShipment.mockResolvedValue({ ok: true })

    await bookShipmentAction(ORDER_NUMBER, { requestToken: 'tok-1', courierId: 'c-1', serviceCode: 'svc-1' })

    expect(roleSatisfies).toHaveBeenCalled()
    expect(bookShipment).not.toHaveBeenCalled()
  })
})
