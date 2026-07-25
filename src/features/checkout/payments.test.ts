import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { PaystackCharge } from '@/features/checkout/lib/paystack'

/**
 * Same mocking pattern as `data.test.ts`/`fulfil-order.test.ts`: `db`,
 * `getCurrentUserId`, the paystack lib, and `markOrderPaid` are all mocked
 * so these tests assert on the *arguments* each collaborator is called
 * with — in particular, that the amount handed to `initializeTransaction`
 * is always the ORDER's stored `totalMinor`, never anything else, since
 * `initializePayment` takes only an `orderNumber`.
 */

const order = {
  findFirst: vi.fn(),
  update: vi.fn(),
}

vi.mock('@/lib/db', () => ({
  db: {
    get order() {
      return order
    },
  },
}))

const getCurrentUserId = vi.fn()

vi.mock('@/features/auth/claims', () => ({
  getCurrentUserId: () => getCurrentUserId(),
}))

const initializeTransaction = vi.fn()
const verifyTransaction = vi.fn()

vi.mock('@/features/checkout/lib/paystack', () => ({
  initializeTransaction: (...args: unknown[]) => initializeTransaction(...args),
  verifyTransaction: (...args: unknown[]) => verifyTransaction(...args),
}))

const markOrderPaid = vi.fn()

vi.mock('@/features/checkout/lib/fulfil-order', () => ({
  markOrderPaid: (...args: unknown[]) => markOrderPaid(...args),
}))

const { initializePayment, verifyPayment } = await import('@/features/checkout/payments')

const ORDER_NUMBER = 'MSE-000123'
const USER_ID = '11111111-1111-4111-8111-111111111111'
const ORDER_ID = 'order-1'
const REFERENCE = 'ref-abc'
const PUBLIC_KEY = 'pk_test_xxx'

function baseOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: ORDER_ID,
    orderNumber: ORDER_NUMBER,
    profileId: USER_ID,
    email: 'jane@example.com',
    currency: 'NGN',
    totalMinor: 787_500,
    paidAt: null,
    paystackReference: null,
    ...overrides,
  }
}

function charge(overrides: Partial<PaystackCharge> = {}): PaystackCharge {
  return {
    reference: REFERENCE,
    status: 'success',
    amountMinor: 787_500,
    currency: 'NGN',
    metadata: { orderNumber: ORDER_NUMBER },
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY = PUBLIC_KEY
})

afterEach(() => {
  delete process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY
})

describe('initializePayment', () => {
  it('signed-in: loads the order scoped by { orderNumber, profileId: userId }, charges the order\'s totalMinor, stores the reference, and returns ok', async () => {
    getCurrentUserId.mockResolvedValue(USER_ID)
    order.findFirst.mockResolvedValue(baseOrder())
    initializeTransaction.mockResolvedValue({ accessCode: 'access_123', reference: 'generated-ref' })
    order.update.mockResolvedValue(baseOrder())

    const result = await initializePayment(ORDER_NUMBER)

    expect(order.findFirst).toHaveBeenCalledWith({ where: { orderNumber: ORDER_NUMBER, profileId: USER_ID } })

    expect(initializeTransaction).toHaveBeenCalledTimes(1)
    const call = initializeTransaction.mock.calls[0][0]
    expect(call.amountMinor).toBe(787_500) // the ORDER's totalMinor, not any other value
    expect(call.currency).toBe('NGN')
    expect(call.email).toBe('jane@example.com')
    expect(call.metadata).toEqual({ orderNumber: ORDER_NUMBER })
    expect(typeof call.reference).toBe('string')

    expect(order.update).toHaveBeenCalledWith({
      where: { id: ORDER_ID },
      data: { paystackReference: call.reference },
    })

    expect(result).toEqual({ ok: true, accessCode: 'access_123', publicKey: PUBLIC_KEY })
  })

  it('guest (userId null): scopes the order lookup by { orderNumber, profileId: null }', async () => {
    getCurrentUserId.mockResolvedValue(null)
    order.findFirst.mockResolvedValue(baseOrder({ profileId: null }))
    initializeTransaction.mockResolvedValue({ accessCode: 'access_456', reference: 'generated-ref' })
    order.update.mockResolvedValue(baseOrder({ profileId: null }))

    const result = await initializePayment(ORDER_NUMBER)

    expect(order.findFirst).toHaveBeenCalledWith({ where: { orderNumber: ORDER_NUMBER, profileId: null } })
    expect(result).toEqual({ ok: true, accessCode: 'access_456', publicKey: PUBLIC_KEY })
  })

  it('order not found: returns { error }, never calls initializeTransaction', async () => {
    getCurrentUserId.mockResolvedValue(USER_ID)
    order.findFirst.mockResolvedValue(null)

    const result = await initializePayment(ORDER_NUMBER)

    expect(result).toEqual({ error: expect.any(String) })
    expect(initializeTransaction).not.toHaveBeenCalled()
    expect(order.update).not.toHaveBeenCalled()
  })

  it('already-paid order: returns { error }, never calls initializeTransaction', async () => {
    getCurrentUserId.mockResolvedValue(USER_ID)
    order.findFirst.mockResolvedValue(baseOrder({ paidAt: new Date() }))

    const result = await initializePayment(ORDER_NUMBER)

    expect(result).toEqual({ error: expect.any(String) })
    expect(initializeTransaction).not.toHaveBeenCalled()
  })

  it('initializeTransaction throws: returns { error }, never throws out', async () => {
    getCurrentUserId.mockResolvedValue(USER_ID)
    order.findFirst.mockResolvedValue(baseOrder())
    initializeTransaction.mockRejectedValue(new Error('Paystack down'))

    const result = await initializePayment(ORDER_NUMBER)

    expect(result).toEqual({ error: expect.any(String) })
    expect(order.update).not.toHaveBeenCalled()
  })
})

describe('verifyPayment', () => {
  it('success + markOrderPaid -> "paid": returns { ok, status: "paid" }', async () => {
    verifyTransaction.mockResolvedValue(charge())
    markOrderPaid.mockResolvedValue('paid')

    const result = await verifyPayment(REFERENCE)

    expect(verifyTransaction).toHaveBeenCalledWith(REFERENCE)
    expect(markOrderPaid).toHaveBeenCalledWith(charge())
    expect(result).toEqual({ ok: true, status: 'paid' })
  })

  it('success + markOrderPaid -> "ignored": returns { ok, status: "processing" } (webhook is the backstop)', async () => {
    verifyTransaction.mockResolvedValue(charge())
    markOrderPaid.mockResolvedValue('ignored')

    const result = await verifyPayment(REFERENCE)

    expect(result).toEqual({ ok: true, status: 'processing' })
  })

  it('success + markOrderPaid -> "mismatch": returns { error }', async () => {
    verifyTransaction.mockResolvedValue(charge())
    markOrderPaid.mockResolvedValue('mismatch')

    const result = await verifyPayment(REFERENCE)

    expect(result).toEqual({ error: expect.any(String) })
  })

  it('verifyTransaction status not success (e.g. abandoned): returns { error }, never calls markOrderPaid', async () => {
    verifyTransaction.mockResolvedValue(charge({ status: 'abandoned' }))

    const result = await verifyPayment(REFERENCE)

    expect(result).toEqual({ error: expect.any(String) })
    expect(markOrderPaid).not.toHaveBeenCalled()
  })

  it('verifyTransaction throws: returns { error }, never throws out', async () => {
    verifyTransaction.mockRejectedValue(new Error('Paystack down'))

    const result = await verifyPayment(REFERENCE)

    expect(result).toEqual({ error: expect.any(String) })
    expect(markOrderPaid).not.toHaveBeenCalled()
  })
})
