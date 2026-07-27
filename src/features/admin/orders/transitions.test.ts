import { describe, it, expect, vi, beforeEach } from 'vitest'

const sendOrderShippedMock = vi.fn()
vi.mock('@/features/email/send', () => ({
  sendOrderShipped: (...args: unknown[]) => sendOrderShippedMock(...args),
}))

/**
 * Same `$transaction` mocking idiom as `fulfil-order.test.ts`: the callback
 * receives spies shared with top-level `db`, so assertions don't need to
 * care whether a call happened inside or outside `$transaction`.
 */

const order = {
  findUnique: vi.fn(),
  updateMany: vi.fn(),
}

const product = {
  update: vi.fn(),
}

const productVariant = {
  update: vi.fn(),
}

const tx = { order, product, productVariant }

const $transaction = vi.fn(async (fn: (client: typeof tx) => unknown) => fn(tx))

vi.mock('@/lib/db', () => ({
  db: {
    get order() {
      return order
    },
    get product() {
      return product
    },
    get productVariant() {
      return productVariant
    },
    $transaction: (...args: [(client: typeof tx) => unknown]) => $transaction(...args),
  },
}))

const { shipOrder, deliverOrder, cancelOrder, markOrderRefunded } = await import('@/features/admin/orders/transitions')

const ORDER_NUMBER = 'MSE-000123'
const ORDER_ID = 'order-1'

const LINES = [
  { id: 'line-1', productId: 'prod-1', variantId: 'variant-1', quantity: 2 },
  { id: 'line-2', productId: 'prod-2', variantId: null, quantity: 3 },
]

beforeEach(() => {
  vi.clearAllMocks()
  order.updateMany.mockResolvedValue({ count: 1 })
  sendOrderShippedMock.mockResolvedValue(undefined)
})

describe('shipOrder', () => {
  it('happy path: PROCESSING order transitions to SHIPPED with tracking data', async () => {
    order.findUnique.mockResolvedValue({ id: ORDER_ID, status: 'PROCESSING' })

    const result = await shipOrder(ORDER_NUMBER, { carrier: 'GIG', trackingNumber: 'TRK-1' })

    expect(result).toEqual({ ok: true })
    expect(order.findUnique).toHaveBeenCalledWith({
      where: { orderNumber: ORDER_NUMBER },
      select: { id: true, status: true },
    })
    expect(order.updateMany).toHaveBeenCalledWith({
      where: { id: ORDER_ID, status: 'PROCESSING' },
      data: {
        status: 'SHIPPED',
        shippedAt: expect.any(Date),
        trackingCarrier: 'GIG',
        trackingNumber: 'TRK-1',
        shipbubbleOrderId: null,
      },
    })
    expect(sendOrderShippedMock).toHaveBeenCalledTimes(1)
    expect(sendOrderShippedMock).toHaveBeenCalledWith(ORDER_NUMBER)
  })

  it('passes through shipbubbleOrderId when supplied', async () => {
    order.findUnique.mockResolvedValue({ id: ORDER_ID, status: 'PROCESSING' })

    const result = await shipOrder(ORDER_NUMBER, { carrier: 'GIG', trackingNumber: 'TRK-1', shipbubbleOrderId: 'sb-1' })

    expect(result).toEqual({ ok: true })
    expect(order.updateMany).toHaveBeenCalledWith({
      where: { id: ORDER_ID, status: 'PROCESSING' },
      data: {
        status: 'SHIPPED',
        shippedAt: expect.any(Date),
        trackingCarrier: 'GIG',
        trackingNumber: 'TRK-1',
        shipbubbleOrderId: 'sb-1',
      },
    })
  })

  it('rejects a blank carrier without reading the db', async () => {
    const result = await shipOrder(ORDER_NUMBER, { carrier: '   ', trackingNumber: 'TRK-1' })

    expect(result).toEqual({ ok: false, error: 'invalid-input' })
    expect(order.findUnique).not.toHaveBeenCalled()
    expect(order.updateMany).not.toHaveBeenCalled()
    expect(sendOrderShippedMock).not.toHaveBeenCalled()
  })

  it('rejects a blank tracking number without reading the db', async () => {
    const result = await shipOrder(ORDER_NUMBER, { carrier: 'GIG', trackingNumber: '   ' })

    expect(result).toEqual({ ok: false, error: 'invalid-input' })
    expect(order.findUnique).not.toHaveBeenCalled()
    expect(order.updateMany).not.toHaveBeenCalled()
    expect(sendOrderShippedMock).not.toHaveBeenCalled()
  })

  it('rejects an order already SHIPPED', async () => {
    order.findUnique.mockResolvedValue({ id: ORDER_ID, status: 'SHIPPED' })

    const result = await shipOrder(ORDER_NUMBER, { carrier: 'GIG', trackingNumber: 'TRK-1' })

    expect(result).toEqual({ ok: false, error: 'invalid-state' })
    expect(order.updateMany).not.toHaveBeenCalled()
    expect(sendOrderShippedMock).not.toHaveBeenCalled()
  })

  it('returns not-found for an unknown order', async () => {
    order.findUnique.mockResolvedValue(null)

    const result = await shipOrder(ORDER_NUMBER, { carrier: 'GIG', trackingNumber: 'TRK-1' })

    expect(result).toEqual({ ok: false, error: 'not-found' })
    expect(order.updateMany).not.toHaveBeenCalled()
    expect(sendOrderShippedMock).not.toHaveBeenCalled()
  })

  it('returns conflict when the guarded updateMany affects zero rows (never throws)', async () => {
    order.findUnique.mockResolvedValue({ id: ORDER_ID, status: 'PROCESSING' })
    order.updateMany.mockResolvedValue({ count: 0 })

    const result = await shipOrder(ORDER_NUMBER, { carrier: 'GIG', trackingNumber: 'TRK-1' })

    expect(result).toEqual({ ok: false, error: 'conflict' })
    expect(sendOrderShippedMock).not.toHaveBeenCalled()
  })

  it('a sender rejection on the happy path leaves the result unchanged', async () => {
    order.findUnique.mockResolvedValue({ id: ORDER_ID, status: 'PROCESSING' })
    sendOrderShippedMock.mockRejectedValue(new Error('resend down'))

    const result = await shipOrder(ORDER_NUMBER, { carrier: 'GIG', trackingNumber: 'TRK-1' })

    expect(result).toEqual({ ok: true })
    expect(sendOrderShippedMock).toHaveBeenCalledTimes(1)
  })

  it('returns error and never throws when the db throws', async () => {
    order.findUnique.mockRejectedValue(new Error('boom'))

    const result = await shipOrder(ORDER_NUMBER, { carrier: 'GIG', trackingNumber: 'TRK-1' })

    expect(result).toEqual({ ok: false, error: 'error' })
  })
})

describe('deliverOrder', () => {
  it('happy path: SHIPPED order transitions to DELIVERED', async () => {
    order.findUnique.mockResolvedValue({ id: ORDER_ID, status: 'SHIPPED' })

    const result = await deliverOrder(ORDER_NUMBER)

    expect(result).toEqual({ ok: true })
    expect(order.findUnique).toHaveBeenCalledWith({
      where: { orderNumber: ORDER_NUMBER },
      select: { id: true, status: true },
    })
    expect(order.updateMany).toHaveBeenCalledWith({
      where: { id: ORDER_ID, status: 'SHIPPED' },
      data: { status: 'DELIVERED', deliveredAt: expect.any(Date) },
    })
  })

  it('rejects a PROCESSING order (must ship first)', async () => {
    order.findUnique.mockResolvedValue({ id: ORDER_ID, status: 'PROCESSING' })

    const result = await deliverOrder(ORDER_NUMBER)

    expect(result).toEqual({ ok: false, error: 'invalid-state' })
    expect(order.updateMany).not.toHaveBeenCalled()
  })

  it('returns not-found for an unknown order', async () => {
    order.findUnique.mockResolvedValue(null)

    const result = await deliverOrder(ORDER_NUMBER)

    expect(result).toEqual({ ok: false, error: 'not-found' })
  })

  it('returns conflict when the guarded updateMany affects zero rows', async () => {
    order.findUnique.mockResolvedValue({ id: ORDER_ID, status: 'SHIPPED' })
    order.updateMany.mockResolvedValue({ count: 0 })

    const result = await deliverOrder(ORDER_NUMBER)

    expect(result).toEqual({ ok: false, error: 'conflict' })
  })

  it('returns error and never throws when the db throws', async () => {
    order.findUnique.mockRejectedValue(new Error('boom'))

    const result = await deliverOrder(ORDER_NUMBER)

    expect(result).toEqual({ ok: false, error: 'error' })
  })
})

describe('cancelOrder', () => {
  it('PENDING: cancels with no restock, no transaction, guard includes paidAt: null', async () => {
    order.findUnique.mockResolvedValue({ id: ORDER_ID, status: 'PENDING', lines: LINES })

    const result = await cancelOrder(ORDER_NUMBER)

    expect(result).toEqual({ ok: true })
    expect(order.findUnique).toHaveBeenCalledWith({ where: { orderNumber: ORDER_NUMBER }, include: { lines: true } })
    expect(order.updateMany).toHaveBeenCalledWith({
      where: { id: ORDER_ID, status: 'PENDING', paidAt: null },
      data: { status: 'CANCELLED', cancelledAt: expect.any(Date) },
    })
    // No refundOwed on the PENDING path.
    expect(order.updateMany).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ refundOwed: expect.anything() }) }),
    )
    expect($transaction).not.toHaveBeenCalled()
    expect(productVariant.update).not.toHaveBeenCalled()
    expect(product.update).not.toHaveBeenCalled()
  })

  it('PENDING: conflict when the guarded updateMany affects zero rows (e.g. a late payment won first)', async () => {
    order.findUnique.mockResolvedValue({ id: ORDER_ID, status: 'PENDING', lines: LINES })
    order.updateMany.mockResolvedValue({ count: 0 })

    const result = await cancelOrder(ORDER_NUMBER)

    expect(result).toEqual({ ok: false, error: 'conflict' })
    expect($transaction).not.toHaveBeenCalled()
    expect(productVariant.update).not.toHaveBeenCalled()
    expect(product.update).not.toHaveBeenCalled()
  })

  it('PROCESSING: cancels in a transaction, sets refundOwed, restocks per line', async () => {
    order.findUnique.mockResolvedValue({ id: ORDER_ID, status: 'PROCESSING', lines: LINES })

    const result = await cancelOrder(ORDER_NUMBER)

    expect(result).toEqual({ ok: true })
    expect($transaction).toHaveBeenCalledTimes(1)
    expect(order.updateMany).toHaveBeenCalledWith({
      where: { id: ORDER_ID, status: 'PROCESSING' },
      data: { status: 'CANCELLED', cancelledAt: expect.any(Date), refundOwed: true },
    })
    expect(productVariant.update).toHaveBeenCalledWith({
      where: { id: 'variant-1' },
      data: { inventory: { increment: 2 } },
    })
    expect(product.update).toHaveBeenCalledWith({
      where: { id: 'prod-2' },
      data: { inventory: { increment: 3 } },
    })
  })

  it('PROCESSING: count 0 yields conflict with NO restock increments', async () => {
    order.findUnique.mockResolvedValue({ id: ORDER_ID, status: 'PROCESSING', lines: LINES })
    order.updateMany.mockResolvedValue({ count: 0 })

    const result = await cancelOrder(ORDER_NUMBER)

    expect(result).toEqual({ ok: false, error: 'conflict' })
    expect(productVariant.update).not.toHaveBeenCalled()
    expect(product.update).not.toHaveBeenCalled()
  })

  it.each(['SHIPPED', 'DELIVERED', 'CANCELLED'])('%s: rejects with invalid-state', async (status) => {
    order.findUnique.mockResolvedValue({ id: ORDER_ID, status, lines: LINES })

    const result = await cancelOrder(ORDER_NUMBER)

    expect(result).toEqual({ ok: false, error: 'invalid-state' })
    expect(order.updateMany).not.toHaveBeenCalled()
    expect($transaction).not.toHaveBeenCalled()
  })

  it('returns not-found for an unknown order', async () => {
    order.findUnique.mockResolvedValue(null)

    const result = await cancelOrder(ORDER_NUMBER)

    expect(result).toEqual({ ok: false, error: 'not-found' })
  })

  it('returns error and never throws when the db throws', async () => {
    order.findUnique.mockRejectedValue(new Error('boom'))

    const result = await cancelOrder(ORDER_NUMBER)

    expect(result).toEqual({ ok: false, error: 'error' })
  })
})

describe('markOrderRefunded', () => {
  it('happy path: refundOwed order flips to refunded with the given reference', async () => {
    order.findUnique.mockResolvedValue({ id: ORDER_ID, refundOwed: true, refundedAt: null })

    const result = await markOrderRefunded(ORDER_NUMBER, { reference: 'RF-1' })

    expect(result).toEqual({ ok: true })
    expect(order.findUnique).toHaveBeenCalledWith({
      where: { orderNumber: ORDER_NUMBER },
      select: { id: true, refundOwed: true, refundedAt: true },
    })
    expect(order.updateMany).toHaveBeenCalledWith({
      where: { id: ORDER_ID, refundOwed: true },
      data: { refundOwed: false, refundedAt: expect.any(Date), refundReference: 'RF-1' },
    })
    expect(productVariant.update).not.toHaveBeenCalled()
    expect(product.update).not.toHaveBeenCalled()
  })

  it('a blank/whitespace reference is stored as null', async () => {
    order.findUnique.mockResolvedValue({ id: ORDER_ID, refundOwed: true, refundedAt: null })

    const result = await markOrderRefunded(ORDER_NUMBER, { reference: '   ' })

    expect(result).toEqual({ ok: true })
    expect(order.updateMany).toHaveBeenCalledWith({
      where: { id: ORDER_ID, refundOwed: true },
      data: { refundOwed: false, refundedAt: expect.any(Date), refundReference: null },
    })
  })

  it('an omitted reference is stored as null', async () => {
    order.findUnique.mockResolvedValue({ id: ORDER_ID, refundOwed: true, refundedAt: null })

    const result = await markOrderRefunded(ORDER_NUMBER, {})

    expect(result).toEqual({ ok: true })
    expect(order.updateMany).toHaveBeenCalledWith({
      where: { id: ORDER_ID, refundOwed: true },
      data: { refundOwed: false, refundedAt: expect.any(Date), refundReference: null },
    })
  })

  it('re-flagged order (refundOwed: true with a past refundedAt) records successfully', async () => {
    // A late chargeback (or any second refund-owed event) flips `refundOwed`
    // back to true without clearing the prior `refundedAt`/`refundReference`
    // from an earlier record. That must still be recordable — the guard is
    // `refundOwed` alone, and the new write is expected to OVERWRITE the
    // stale refundedAt/refundReference with the new record.
    const priorRefundedAt = new Date('2026-01-01T00:00:00Z')
    order.findUnique.mockResolvedValue({ id: ORDER_ID, refundOwed: true, refundedAt: priorRefundedAt })

    const result = await markOrderRefunded(ORDER_NUMBER, { reference: 'RF-2' })

    expect(result).toEqual({ ok: true })
    expect(order.updateMany).toHaveBeenCalledWith({
      where: { id: ORDER_ID, refundOwed: true },
      data: { refundOwed: false, refundedAt: expect.any(Date), refundReference: 'RF-2' },
    })
  })

  it('returns conflict when the guarded updateMany affects zero rows (never throws)', async () => {
    order.findUnique.mockResolvedValue({ id: ORDER_ID, refundOwed: true, refundedAt: null })
    order.updateMany.mockResolvedValue({ count: 0 })

    const result = await markOrderRefunded(ORDER_NUMBER, { reference: 'RF-1' })

    expect(result).toEqual({ ok: false, error: 'conflict' })
    expect(productVariant.update).not.toHaveBeenCalled()
    expect(product.update).not.toHaveBeenCalled()
  })

  it('returns not-found for an unknown order', async () => {
    order.findUnique.mockResolvedValue(null)

    const result = await markOrderRefunded(ORDER_NUMBER, { reference: 'RF-1' })

    expect(result).toEqual({ ok: false, error: 'not-found' })
    expect(order.updateMany).not.toHaveBeenCalled()
  })

  it('rejects an order that is not owed a refund (refundOwed: false)', async () => {
    order.findUnique.mockResolvedValue({ id: ORDER_ID, refundOwed: false, refundedAt: null })

    const result = await markOrderRefunded(ORDER_NUMBER, { reference: 'RF-1' })

    expect(result).toEqual({ ok: false, error: 'invalid-state' })
    expect(order.updateMany).not.toHaveBeenCalled()
  })

  it('rejects an order that is not owed a refund even with a past refundedAt set', async () => {
    order.findUnique.mockResolvedValue({ id: ORDER_ID, refundOwed: false, refundedAt: new Date() })

    const result = await markOrderRefunded(ORDER_NUMBER, { reference: 'RF-1' })

    expect(result).toEqual({ ok: false, error: 'invalid-state' })
    expect(order.updateMany).not.toHaveBeenCalled()
  })

  it('returns error and never throws when the db throws', async () => {
    order.findUnique.mockRejectedValue(new Error('boom'))

    const result = await markOrderRefunded(ORDER_NUMBER, { reference: 'RF-1' })

    expect(result).toEqual({ ok: false, error: 'error' })
  })
})
