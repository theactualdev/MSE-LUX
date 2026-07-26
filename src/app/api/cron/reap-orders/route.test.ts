import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import crypto from 'node:crypto'

vi.mock('@/features/admin/orders/reaper', () => ({
  reapAbandonedOrders: vi.fn(),
}))

import { GET } from './route'
import { reapAbandonedOrders } from '@/features/admin/orders/reaper'

const reapAbandonedOrdersMock = vi.mocked(reapAbandonedOrders)

const SECRET = 'cron_secret_xxx'

function makeRequest(authorization?: string | null): Request {
  const headers: Record<string, string> = {}
  if (authorization !== undefined && authorization !== null) headers.authorization = authorization
  return new Request('http://localhost/api/cron/reap-orders', { headers })
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.CRON_SECRET = SECRET
})

afterEach(() => {
  vi.restoreAllMocks()
  delete process.env.CRON_SECRET
})

it('missing Authorization header: responds 401 with empty body, never touches the engine', async () => {
  const res = await GET(makeRequest())

  expect(res.status).toBe(401)
  expect(await res.json()).toEqual({})
  expect(reapAbandonedOrdersMock).not.toHaveBeenCalled()
})

it('wrong Authorization header: responds 401 with empty body, never touches the engine', async () => {
  const res = await GET(makeRequest('Bearer wrong_secret'))

  expect(res.status).toBe(401)
  expect(await res.json()).toEqual({})
  expect(reapAbandonedOrdersMock).not.toHaveBeenCalled()
})

it('wrong-length Authorization header: responds 401 with empty body, never touches the engine', async () => {
  const res = await GET(makeRequest('Bearer x'))

  expect(res.status).toBe(401)
  expect(await res.json()).toEqual({})
  expect(reapAbandonedOrdersMock).not.toHaveBeenCalled()
})

it('CRON_SECRET not set: responds 500 with empty body, never touches the engine, and logs', async () => {
  delete process.env.CRON_SECRET
  const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

  const res = await GET(makeRequest(`Bearer ${SECRET}`))

  expect(res.status).toBe(500)
  expect(await res.json()).toEqual({})
  expect(reapAbandonedOrdersMock).not.toHaveBeenCalled()
  expect(consoleErrorSpy).toHaveBeenCalled()
})

it('correct Authorization header: calls the engine and responds 200 with the reaped count', async () => {
  reapAbandonedOrdersMock.mockResolvedValue({ ok: true, reaped: 5 })

  const res = await GET(makeRequest(`Bearer ${SECRET}`))

  expect(res.status).toBe(200)
  expect(await res.json()).toEqual({ reaped: 5 })
  expect(reapAbandonedOrdersMock).toHaveBeenCalledTimes(1)
})

it('engine returns ok:false: responds 500 with empty body', async () => {
  reapAbandonedOrdersMock.mockResolvedValue({ ok: false, error: 'error' })

  const res = await GET(makeRequest(`Bearer ${SECRET}`))

  expect(res.status).toBe(500)
  expect(await res.json()).toEqual({})
})

it('uses crypto.timingSafeEqual for equal-length comparisons (not called for a length mismatch)', async () => {
  const timingSafeEqualSpy = vi.spyOn(crypto, 'timingSafeEqual')
  reapAbandonedOrdersMock.mockResolvedValue({ ok: true, reaped: 0 })

  await GET(makeRequest('Bearer x'))
  expect(timingSafeEqualSpy).not.toHaveBeenCalled()

  timingSafeEqualSpy.mockClear()
  await GET(makeRequest(`Bearer ${SECRET}`))
  expect(timingSafeEqualSpy).toHaveBeenCalledTimes(1)
})
