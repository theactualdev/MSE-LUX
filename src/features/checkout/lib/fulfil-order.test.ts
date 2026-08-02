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

const discountCode = {
  findUnique: vi.fn(),
  updateMany: vi.fn(),
}

const tx = { order, product, productVariant, cartItem, discountCode }

// Asserts, immediately after the callback resolves (i.e. while still
// "inside" the transaction from the caller's perspective), that the send has
// NOT happened yet — this is what actually catches a send moved inside the
// `$transaction` callback (which would hold a DB connection across a network
// call), unlike merely comparing invocation-call-order.
const $transaction = vi.fn(async (fn: (client: typeof tx) => unknown) => {
  const result = await fn(tx)
  expect(sendOrderConfirmationMock).not.toHaveBeenCalled()
  return result
})

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
    get discountCode() {
      return discountCode
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
    // fulfilment transaction resolves — never interleaved with it. The
    // "never interleaved" half is pinned inside the `$transaction` mock
    // itself (see its definition above), which asserts no-call immediately
    // after the callback resolves; that catches a send moved inside the
    // callback, which a call-order comparison alone would not.
    expect(sendOrderConfirmationMock).toHaveBeenCalledTimes(1)
    expect(sendOrderConfirmationMock).toHaveBeenCalledWith(ORDER_NUMBER)
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
    expect(sendOrderConfirmationMock).not.toHaveBeenCalled()
  })

  it('rejects a currency mismatch: mismatch, no writes', async () => {
    order.findUnique.mockResolvedValue(baseOrder())

    const result = await markOrderPaid(charge({ currency: 'USD' }))

    expect(result).toBe('mismatch')
    expect(order.updateMany).not.toHaveBeenCalled()
    expect(sendOrderConfirmationMock).not.toHaveBeenCalled()
  })

  it('ignores a charge with no metadata.orderNumber, without reading the db', async () => {
    const result = await markOrderPaid(charge({ metadata: {} }))

    expect(result).toBe('ignored')
    expect(order.findUnique).not.toHaveBeenCalled()
    expect(sendOrderConfirmationMock).not.toHaveBeenCalled()
  })

  it('ignores a charge whose order cannot be found', async () => {
    order.findUnique.mockResolvedValue(null)

    const result = await markOrderPaid(charge())

    expect(result).toBe('ignored')
    expect(order.updateMany).not.toHaveBeenCalled()
    expect(sendOrderConfirmationMock).not.toHaveBeenCalled()
  })

  it('an unexpected db error is swallowed: returns ignored, no confirmation sent', async () => {
    order.findUnique.mockRejectedValue(new Error('connection reset'))

    const result = await markOrderPaid(charge())

    expect(result).toBe('ignored')
    expect(sendOrderConfirmationMock).not.toHaveBeenCalled()
  })

  it('a sender rejection on the genuine fulfilment path leaves the return value unchanged', async () => {
    order.findUnique.mockResolvedValue(baseOrder())
    sendOrderConfirmationMock.mockRejectedValue(new Error('resend down'))

    const result = await markOrderPaid(charge())

    expect(result).toBe('paid')
    expect(sendOrderConfirmationMock).toHaveBeenCalledTimes(1)
  })
})

describe('markOrderPaid — discount redemption', () => {
  beforeEach(() => {
    discountCode.findUnique.mockResolvedValue({ maxUses: 100 })
    discountCode.updateMany.mockResolvedValue({ count: 1 })
  })

  it('increments the code inside the fulfilment transaction, guarded by the cap', async () => {
    order.findUnique.mockResolvedValue(baseOrder({ discountCode: 'LAUNCH20' }))

    const result = await markOrderPaid(charge())

    expect(result).toBe('paid')
    expect(discountCode.findUnique).toHaveBeenCalledWith({
      where: { code: 'LAUNCH20' },
      select: { maxUses: true },
    })
    expect(discountCode.updateMany).toHaveBeenCalledWith({
      where: { code: 'LAUNCH20', timesUsed: { lt: 100 } },
      data: { timesUsed: { increment: 1 } },
    })
  })

  it('increments with no cap clause when the code has no maxUses', async () => {
    discountCode.findUnique.mockResolvedValue({ maxUses: null })
    order.findUnique.mockResolvedValue(baseOrder({ discountCode: 'LAUNCH20' }))

    await markOrderPaid(charge())

    expect(discountCode.updateMany).toHaveBeenCalledWith({
      where: { code: 'LAUNCH20' },
      data: { timesUsed: { increment: 1 } },
    })
  })

  it('does not increment for an order with no code', async () => {
    order.findUnique.mockResolvedValue(baseOrder())

    const result = await markOrderPaid(charge())

    expect(result).toBe('paid')
    expect(discountCode.findUnique).not.toHaveBeenCalled()
    expect(discountCode.updateMany).not.toHaveBeenCalled()
  })

  /** The customer has already been charged — a cap reached in the meantime must not fail the payment. */
  it('still reports paid when the cap guard matches nothing', async () => {
    order.findUnique.mockResolvedValue(baseOrder({ discountCode: 'LAUNCH20' }))
    discountCode.updateMany.mockResolvedValue({ count: 0 })

    await expect(markOrderPaid(charge())).resolves.toBe('paid')
  })

  it('does not increment on the already-paid short circuit (a duplicate webhook)', async () => {
    order.findUnique.mockResolvedValue(
      baseOrder({ discountCode: 'LAUNCH20', paidAt: new Date('2026-01-01T00:00:00Z') }),
    )

    await expect(markOrderPaid(charge())).resolves.toBe('paid')
    expect(discountCode.updateMany).not.toHaveBeenCalled()
  })

  it('does not increment when the fulfilment guard is lost (a race loser)', async () => {
    order.findUnique
      .mockResolvedValueOnce(baseOrder({ discountCode: 'LAUNCH20' }))
      // The post-loss lookup: another caller already won and flipped paidAt.
      .mockResolvedValueOnce({ paidAt: new Date('2026-01-01T00:00:00Z'), status: 'PROCESSING' })
    order.updateMany.mockResolvedValue({ count: 0 })

    await markOrderPaid(charge())

    expect(discountCode.updateMany).not.toHaveBeenCalled()
  })
})
