import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import crypto from 'node:crypto'

const SECRET = 'sk_test_xxx'

beforeEach(() => {
  process.env.PAYSTACK_SECRET_KEY = SECRET
})

afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.PAYSTACK_SECRET_KEY
})

const { initializeTransaction, verifyTransaction, verifyWebhookSignature, parseWebhookCharge } = await import(
  '@/features/checkout/lib/paystack'
)

describe('initializeTransaction', () => {
  it('POSTs to /transaction/initialize with the Bearer header and the amount/currency/email/reference/metadata body, and maps the response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: true,
        message: 'ok',
        data: { access_code: 'access_123', reference: 'ref_123', authorization_url: 'https://paystack.com/pay/ref_123' },
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await initializeTransaction({
      email: 'buyer@example.com',
      amountMinor: 500_00,
      currency: 'NGN',
      reference: 'ref_123',
      metadata: { orderNumber: 'MSE-000123' },
    })

    expect(result).toEqual({ accessCode: 'access_123', reference: 'ref_123' })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.paystack.co/transaction/initialize')
    expect(init.method).toBe('POST')
    expect(init.headers).toMatchObject({
      Authorization: `Bearer ${SECRET}`,
      'Content-Type': 'application/json',
    })
    expect(JSON.parse(init.body)).toEqual({
      email: 'buyer@example.com',
      amount: 500_00,
      currency: 'NGN',
      reference: 'ref_123',
      metadata: { orderNumber: 'MSE-000123' },
    })
  })

  it('throws when the response is status:false', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ status: false, message: 'Invalid key' }),
      }),
    )

    await expect(
      initializeTransaction({
        email: 'buyer@example.com',
        amountMinor: 100,
        currency: 'NGN',
        reference: 'ref_x',
        metadata: {},
      }),
    ).rejects.toThrow()
  })

  it('throws when the response is a non-2xx', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }))

    await expect(
      initializeTransaction({
        email: 'buyer@example.com',
        amountMinor: 100,
        currency: 'NGN',
        reference: 'ref_x',
        metadata: {},
      }),
    ).rejects.toThrow()
  })

  it('throws when PAYSTACK_SECRET_KEY is not set', async () => {
    delete process.env.PAYSTACK_SECRET_KEY
    vi.stubGlobal('fetch', vi.fn())

    await expect(
      initializeTransaction({
        email: 'buyer@example.com',
        amountMinor: 100,
        currency: 'NGN',
        reference: 'ref_x',
        metadata: {},
      }),
    ).rejects.toThrow('PAYSTACK_SECRET_KEY is not set')
  })
})

describe('verifyTransaction', () => {
  it('GETs /transaction/verify/<reference> with the Bearer header and maps data to a PaystackCharge', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: true,
        data: {
          reference: 'ref_123',
          status: 'success',
          amount: 500_00,
          currency: 'NGN',
          metadata: { orderNumber: 'MSE-000123' },
        },
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const charge = await verifyTransaction('ref_123')

    expect(charge).toEqual({
      reference: 'ref_123',
      status: 'success',
      amountMinor: 500_00,
      currency: 'NGN',
      metadata: { orderNumber: 'MSE-000123' },
    })

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.paystack.co/transaction/verify/ref_123')
    expect(init.headers).toMatchObject({ Authorization: `Bearer ${SECRET}` })
  })

  it('normalizes a null metadata to {}', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: true,
          data: { reference: 'ref_1', status: 'abandoned', amount: 100, currency: 'USD', metadata: null },
        }),
      }),
    )

    const charge = await verifyTransaction('ref_1')
    expect(charge.metadata).toEqual({})
  })

  it('normalizes a non-object (e.g. stringified JSON) metadata to {}', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: true,
          data: { reference: 'ref_1', status: 'failed', amount: 100, currency: 'USD', metadata: '{"orderNumber":"MSE-1"}' },
        }),
      }),
    )

    const charge = await verifyTransaction('ref_1')
    expect(charge.metadata).toEqual({})
  })

  it('throws on status:false', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: false, message: 'not found' }) }))
    await expect(verifyTransaction('ref_missing')).rejects.toThrow()
  })
})

describe('verifyWebhookSignature', () => {
  const rawBody = JSON.stringify({ event: 'charge.success', data: { reference: 'ref_1' } })

  it('returns true for a signature matching the HMAC-SHA512 of the raw body', () => {
    const expected = crypto.createHmac('sha512', SECRET).update(rawBody).digest('hex')
    expect(verifyWebhookSignature(rawBody, expected)).toBe(true)
  })

  it('returns false for a wrong signature', () => {
    const wrong = crypto.createHmac('sha512', SECRET).update(rawBody + 'tampered').digest('hex')
    expect(verifyWebhookSignature(rawBody, wrong)).toBe(false)
  })

  it('returns false for a signature of the wrong length', () => {
    expect(verifyWebhookSignature(rawBody, 'deadbeef')).toBe(false)
  })

  it('returns false for a null signature', () => {
    expect(verifyWebhookSignature(rawBody, null)).toBe(false)
  })
})

describe('parseWebhookCharge', () => {
  it('returns the PaystackCharge for a charge.success body', () => {
    const body = {
      event: 'charge.success',
      data: {
        reference: 'ref_1',
        status: 'success',
        amount: 250_00,
        currency: 'NGN',
        metadata: { orderNumber: 'MSE-000456' },
      },
    }
    expect(parseWebhookCharge(body)).toEqual({
      reference: 'ref_1',
      status: 'success',
      amountMinor: 250_00,
      currency: 'NGN',
      metadata: { orderNumber: 'MSE-000456' },
    })
  })

  it('normalizes a null metadata to {}', () => {
    const body = {
      event: 'charge.success',
      data: { reference: 'ref_1', status: 'success', amount: 100, currency: 'USD', metadata: null },
    }
    expect(parseWebhookCharge(body)).toEqual({
      reference: 'ref_1',
      status: 'success',
      amountMinor: 100,
      currency: 'USD',
      metadata: {},
    })
  })

  it('returns null for a non charge.success event', () => {
    const body = {
      event: 'charge.failed',
      data: { reference: 'ref_1', status: 'failed', amount: 100, currency: 'NGN', metadata: null },
    }
    expect(parseWebhookCharge(body)).toBeNull()
  })

  it('returns null for a malformed body', () => {
    expect(parseWebhookCharge(null)).toBeNull()
    expect(parseWebhookCharge(undefined)).toBeNull()
    expect(parseWebhookCharge('not json')).toBeNull()
    expect(parseWebhookCharge({})).toBeNull()
    expect(parseWebhookCharge({ event: 'charge.success' })).toBeNull()
    expect(parseWebhookCharge({ event: 'charge.success', data: null })).toBeNull()
  })
})
