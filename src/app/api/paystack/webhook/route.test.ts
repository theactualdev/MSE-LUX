import { afterEach, beforeEach, expect, it, vi } from 'vitest'

vi.mock('@/features/checkout/lib/paystack', () => ({
  verifyWebhookSignature: vi.fn(),
  parseWebhookCharge: vi.fn(),
}))
vi.mock('@/features/checkout/lib/fulfil-order', () => ({
  markOrderPaid: vi.fn(),
}))

import { POST } from './route'
import { verifyWebhookSignature, parseWebhookCharge } from '@/features/checkout/lib/paystack'
import { markOrderPaid } from '@/features/checkout/lib/fulfil-order'

const verifyWebhookSignatureMock = vi.mocked(verifyWebhookSignature)
const parseWebhookChargeMock = vi.mocked(parseWebhookCharge)
const markOrderPaidMock = vi.mocked(markOrderPaid)

const charge = {
  reference: 'ref_123',
  status: 'success',
  amountMinor: 500_00,
  currency: 'NGN',
  metadata: { orderNumber: 'MSE-000123' },
}

function makeRequest(rawJson: string, signature: string | null = 'sig_abc') {
  const headers: Record<string, string> = {}
  if (signature !== null) headers['x-paystack-signature'] = signature
  return new Request('http://localhost/api/paystack/webhook', {
    method: 'POST',
    body: rawJson,
    headers,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

it('valid signature + charge.success: calls markOrderPaid with the parsed charge and responds 200', async () => {
  verifyWebhookSignatureMock.mockReturnValue(true)
  parseWebhookChargeMock.mockReturnValue(charge)
  markOrderPaidMock.mockResolvedValue('paid')

  const rawJson = JSON.stringify({ event: 'charge.success', data: charge })
  const res = await POST(makeRequest(rawJson, 'sig_abc'))

  expect(res.status).toBe(200)
  expect(markOrderPaidMock).toHaveBeenCalledWith(charge)
  expect(verifyWebhookSignatureMock).toHaveBeenCalledWith(rawJson, 'sig_abc')
})

it('invalid signature: responds 401, does not call parseWebhookCharge or markOrderPaid', async () => {
  verifyWebhookSignatureMock.mockReturnValue(false)

  const rawJson = JSON.stringify({ event: 'charge.success', data: charge })
  const res = await POST(makeRequest(rawJson, 'bad_sig'))

  expect(res.status).toBe(401)
  expect(parseWebhookChargeMock).not.toHaveBeenCalled()
  expect(markOrderPaidMock).not.toHaveBeenCalled()
})

it('valid signature, non-charge event: responds 200, does not call markOrderPaid', async () => {
  verifyWebhookSignatureMock.mockReturnValue(true)
  parseWebhookChargeMock.mockReturnValue(null)

  const rawJson = JSON.stringify({ event: 'transfer.success', data: {} })
  const res = await POST(makeRequest(rawJson))

  expect(res.status).toBe(200)
  expect(markOrderPaidMock).not.toHaveBeenCalled()
})

it('valid signature, markOrderPaid throws: still responds 200 (no propagated 500)', async () => {
  verifyWebhookSignatureMock.mockReturnValue(true)
  parseWebhookChargeMock.mockReturnValue(charge)
  markOrderPaidMock.mockRejectedValue(new Error('db down'))

  const rawJson = JSON.stringify({ event: 'charge.success', data: charge })
  const res = await POST(makeRequest(rawJson))

  expect(res.status).toBe(200)
})

it('duplicate delivery: markOrderPaid invoked each time, both respond 200', async () => {
  verifyWebhookSignatureMock.mockReturnValue(true)
  parseWebhookChargeMock.mockReturnValue(charge)
  markOrderPaidMock.mockResolvedValue('paid')

  const rawJson = JSON.stringify({ event: 'charge.success', data: charge })

  const res1 = await POST(makeRequest(rawJson))
  const res2 = await POST(makeRequest(rawJson))

  expect(res1.status).toBe(200)
  expect(res2.status).toBe(200)
  expect(markOrderPaidMock).toHaveBeenCalledTimes(2)
  expect(markOrderPaidMock).toHaveBeenNthCalledWith(1, charge)
  expect(markOrderPaidMock).toHaveBeenNthCalledWith(2, charge)
})
