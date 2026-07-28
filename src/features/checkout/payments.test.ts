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

// The guest ownership gate: initializePayment reads the httpOnly `mse_guest_order`
// cookie placeOrder set, and only proceeds if it names this order.
const cookieStore = { get: vi.fn(), set: vi.fn() }
vi.mock('next/headers', () => ({ cookies: vi.fn(async () => cookieStore) }))

const checkRateLimit = vi.fn()
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: (...args: unknown[]) => checkRateLimit(...args),
  RATE_LIMITS: { payment: { limit: 10, windowSeconds: 60 }, checkout: { limit: 20, windowSeconds: 60 }, search: { limit: 60, windowSeconds: 60 }, auth: { limit: 10, windowSeconds: 300 } },
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
  // By default the guest cookie names this order (the ownership check passes);
  // the mismatch case overrides this per-test.
  cookieStore.get.mockReturnValue({ value: ORDER_NUMBER })
  // Default the limiter to "allow" so every pre-existing test below keeps
  // exercising real behaviour untouched; the rate-limit describe block below
  // overrides this per-test.
  checkRateLimit.mockResolvedValue(true)
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

  it('guest (userId null) with a matching mse_guest_order cookie: scopes the lookup by { orderNumber, profileId: null }', async () => {
    getCurrentUserId.mockResolvedValue(null)
    cookieStore.get.mockReturnValue({ value: ORDER_NUMBER })
    order.findFirst.mockResolvedValue(baseOrder({ profileId: null }))
    initializeTransaction.mockResolvedValue({ accessCode: 'access_456', reference: 'generated-ref' })
    order.update.mockResolvedValue(baseOrder({ profileId: null }))

    const result = await initializePayment(ORDER_NUMBER)

    expect(order.findFirst).toHaveBeenCalledWith({ where: { orderNumber: ORDER_NUMBER, profileId: null } })
    expect(result).toEqual({ ok: true, accessCode: 'access_456', publicKey: PUBLIC_KEY })
  })

  it('guest whose mse_guest_order cookie does NOT match the order number: returns { error }, never queries the DB or calls initializeTransaction (no enumeration)', async () => {
    getCurrentUserId.mockResolvedValue(null)
    cookieStore.get.mockReturnValue({ value: 'MSE-999999' }) // a different (their own) order

    const result = await initializePayment(ORDER_NUMBER)

    expect('error' in result).toBe(true)
    expect(order.findFirst).not.toHaveBeenCalled()
    expect(initializeTransaction).not.toHaveBeenCalled()
  })

  it('guest with no mse_guest_order cookie: returns { error }, never queries the DB', async () => {
    getCurrentUserId.mockResolvedValue(null)
    cookieStore.get.mockReturnValue(undefined)

    const result = await initializePayment(ORDER_NUMBER)

    expect('error' in result).toBe(true)
    expect(order.findFirst).not.toHaveBeenCalled()
    expect(initializeTransaction).not.toHaveBeenCalled()
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

describe('rate limiting — the "payment" window guards both actions before any other work', () => {
  it('initializePayment: limited returns the rate-limited error and never touches the DB or Paystack', async () => {
    checkRateLimit.mockResolvedValue(false)
    getCurrentUserId.mockResolvedValue(USER_ID)

    const result = await initializePayment(ORDER_NUMBER)

    expect(checkRateLimit).toHaveBeenCalledWith('payment')
    expect(result).toEqual({ error: 'Too many attempts. Please wait a moment and try again.' })
    expect(order.findFirst).not.toHaveBeenCalled()
    expect(initializeTransaction).not.toHaveBeenCalled()
    expect(order.update).not.toHaveBeenCalled()
  })

  it('verifyPayment: limited returns the rate-limited error and never touches Paystack or markOrderPaid', async () => {
    checkRateLimit.mockResolvedValue(false)

    const result = await verifyPayment(REFERENCE)

    expect(checkRateLimit).toHaveBeenCalledWith('payment')
    expect(result).toEqual({ error: 'Too many attempts. Please wait a moment and try again.' })
    expect(verifyTransaction).not.toHaveBeenCalled()
    expect(markOrderPaid).not.toHaveBeenCalled()
  })
})
