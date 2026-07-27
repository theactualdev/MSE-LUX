import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { PaystackCharge } from '@/features/checkout/lib/paystack'

const sendOrderConfirmationMock = vi.fn()
vi.mock('@/features/email/send', () => ({
  sendOrderConfirmation: (...args: unknown[]) => sendOrderConfirmationMock(...args),
}))

/**
 * Same `$transaction` mocking pattern as `checkout/data.test.ts`: the
 * callback receives spies shared with top-level `db`, so assertions don't
 * need to care whether a call happened inside or outside `$transaction`.
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

const cartItem = {
  deleteMany: vi.fn(),
}

const tx = { order, product, productVariant, cartItem }

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
    get cartItem() {
      return cartItem
    },
    $transaction: (...args: [(client: typeof tx) => unknown]) => $transaction(...args),
  },
}))

const { markOrderPaid } = await import('@/features/checkout/lib/fulfil-order')

const ORDER_NUMBER = 'MSE-000123'
const PROFILE_ID = '11111111-1111-4111-8111-111111111111'
const ORDER_ID = 'order-1'
const REFERENCE = 'ref-abc'

function charge(overrides: Partial<PaystackCharge> = {}): PaystackCharge {
  return {
    reference: REFERENCE,
    status: 'success',
    amountMinor: 50_000,
    currency: 'NGN',
    metadata: { orderNumber: ORDER_NUMBER },
    ...overrides,
  }
}

function baseOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: ORDER_ID,
    orderNumber: ORDER_NUMBER,
    profileId: PROFILE_ID,
    currency: 'NGN',
    totalMinor: 50_000,
    paidAt: null,
    lines: [
      { id: 'line-1', productId: 'prod-1', variantId: 'variant-1', quantity: 2 },
      { id: 'line-2', productId: 'prod-2', variantId: null, quantity: 3 },
    ],
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  order.updateMany.mockResolvedValue({ count: 1 })
  sendOrderConfirmationMock.mockResolvedValue(undefined)
})

describe('markOrderPaid', () => {
  it('fulfils a signed-in order: atomic transition, per-line decrement, cart clear', async () => {
    order.findUnique.mockResolvedValue(baseOrder())

    const result = await markOrderPaid(charge())

    expect(result).toBe('paid')

    expect(order.findUnique).toHaveBeenCalledWith({ where: { orderNumber: ORDER_NUMBER }, include: { lines: true } })

    expect(order.updateMany).toHaveBeenCalledWith({
      where: { id: ORDER_ID, paidAt: null, status: 'PENDING' },
      data: { status: 'PROCESSING', paidAt: expect.any(Date), paystackReference: REFERENCE },
    })

    expect(productVariant.update).toHaveBeenCalledWith({
      where: { id: 'variant-1' },
      data: { inventory: { decrement: 2 } },
    })
    expect(product.update).toHaveBeenCalledWith({
      where: { id: 'prod-2' },
      data: { inventory: { decrement: 3 } },
    })

    expect(cartItem.deleteMany).toHaveBeenCalledWith({ where: { cart: { profileId: PROFILE_ID } } })

    // The confirmation is sent exactly once, and strictly AFTER the
    // fulfilment transaction resolves — never interleaved with it.
    expect(sendOrderConfirmationMock).toHaveBeenCalledTimes(1)
    expect(sendOrderConfirmationMock).toHaveBeenCalledWith(ORDER_NUMBER)
    expect($transaction.mock.invocationCallOrder[0]).toBeLessThan(sendOrderConfirmationMock.mock.invocationCallOrder[0])
  })

  it('fulfils a guest order but does not clear a cart', async () => {
    order.findUnique.mockResolvedValue(baseOrder({ profileId: null }))

    const result = await markOrderPaid(charge())

    expect(result).toBe('paid')
    expect(order.updateMany).toHaveBeenCalledWith({
      where: { id: ORDER_ID, paidAt: null, status: 'PENDING' },
      data: { status: 'PROCESSING', paidAt: expect.any(Date), paystackReference: REFERENCE },
    })
    expect(productVariant.update).toHaveBeenCalled()
    expect(product.update).toHaveBeenCalled()
    expect(cartItem.deleteMany).not.toHaveBeenCalled()
  })

  it('is idempotent: an already-paid order short-circuits with no writes', async () => {
    order.findUnique.mockResolvedValue(baseOrder({ paidAt: new Date('2026-01-01T00:00:00Z') }))

    const result = await markOrderPaid(charge())

    expect(result).toBe('paid')
    expect(order.updateMany).not.toHaveBeenCalled()
    expect(productVariant.update).not.toHaveBeenCalled()
    expect(product.update).not.toHaveBeenCalled()
    expect(cartItem.deleteMany).not.toHaveBeenCalled()
    // Already fulfilled by whichever caller got there first — that caller
    // sent the confirmation once already; this short-circuit must not send again.
    expect(sendOrderConfirmationMock).not.toHaveBeenCalled()
  })

  it('loses a concurrent race (updateMany count 0, other caller already set paidAt): returns paid with no side effects', async () => {
    order.findUnique
      .mockResolvedValueOnce(baseOrder())
      // The post-loss lookup: another caller already won and flipped paidAt —
      // existing race semantics (idempotent success), not the cancelled case.
      .mockResolvedValueOnce({ paidAt: new Date('2026-01-01T00:00:00Z'), status: 'PROCESSING' })
    order.updateMany.mockResolvedValue({ count: 0 })

    const result = await markOrderPaid(charge())

    expect(result).toBe('paid')
    expect(order.updateMany).toHaveBeenCalledTimes(1)
    expect(productVariant.update).not.toHaveBeenCalled()
    expect(product.update).not.toHaveBeenCalled()
    expect(cartItem.deleteMany).not.toHaveBeenCalled()
    // The race WINNER already sent the confirmation; a loser must not send a second one.
    expect(sendOrderConfirmationMock).not.toHaveBeenCalled()
  })

  it('loses to a cancel (updateMany count 0, order was CANCELLED before this charge landed): flags refundOwed, returns mismatch, no fulfilment side effects', async () => {
    order.findUnique
      .mockResolvedValueOnce(baseOrder())
      // The post-loss lookup: an admin PENDING-cancel won the race — the
      // order is CANCELLED and was never paid.
      .mockResolvedValueOnce({ paidAt: null, status: 'CANCELLED' })
    order.updateMany.mockResolvedValue({ count: 0 })

    const result = await markOrderPaid(charge())

    expect(result).toBe('mismatch')
    expect(order.updateMany).toHaveBeenCalledTimes(2)
    expect(order.updateMany).toHaveBeenNthCalledWith(1, {
      where: { id: ORDER_ID, paidAt: null, status: 'PENDING' },
      data: { status: 'PROCESSING', paidAt: expect.any(Date), paystackReference: REFERENCE },
    })
    expect(order.updateMany).toHaveBeenNthCalledWith(2, {
      where: { id: ORDER_ID, status: 'CANCELLED' },
      data: { refundOwed: true, paystackReference: REFERENCE },
    })
    expect(productVariant.update).not.toHaveBeenCalled()
    expect(product.update).not.toHaveBeenCalled()
    expect(cartItem.deleteMany).not.toHaveBeenCalled()
    // The order is CANCELLED — a confirmation email would be actively wrong.
    expect(sendOrderConfirmationMock).not.toHaveBeenCalled()
  })

  it('rejects an amount mismatch: mismatch, no writes, order left pending', async () => {
    order.findUnique.mockResolvedValue(baseOrder())

    const result = await markOrderPaid(charge({ amountMinor: 1 }))

    expect(result).toBe('mismatch')
    expect(order.updateMany).not.toHaveBeenCalled()
    expect(product.update).not.toHaveBeenCalled()
    expect(productVariant.update).not.toHaveBeenCalled()
    expect(cartItem.deleteMany).not.toHaveBeenCalled()
  })

  it('rejects a currency mismatch: mismatch, no writes', async () => {
    order.findUnique.mockResolvedValue(baseOrder())

    const result = await markOrderPaid(charge({ currency: 'USD' }))

    expect(result).toBe('mismatch')
    expect(order.updateMany).not.toHaveBeenCalled()
  })

  it('ignores a charge with no metadata.orderNumber, without reading the db', async () => {
    const result = await markOrderPaid(charge({ metadata: {} }))

    expect(result).toBe('ignored')
    expect(order.findUnique).not.toHaveBeenCalled()
  })

  it('ignores a charge whose order cannot be found', async () => {
    order.findUnique.mockResolvedValue(null)

    const result = await markOrderPaid(charge())

    expect(result).toBe('ignored')
    expect(order.updateMany).not.toHaveBeenCalled()
  })

  it('a sender rejection on the genuine fulfilment path leaves the return value unchanged', async () => {
    order.findUnique.mockResolvedValue(baseOrder())
    sendOrderConfirmationMock.mockRejectedValue(new Error('resend down'))

    const result = await markOrderPaid(charge())

    expect(result).toBe('paid')
    expect(sendOrderConfirmationMock).toHaveBeenCalledTimes(1)
  })
})
