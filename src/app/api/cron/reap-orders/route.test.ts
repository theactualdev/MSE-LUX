import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import crypto from 'node:crypto'

vi.mock('@/features/admin/orders/reaper', () => ({
  reapAbandonedOrders: vi.fn(),
}))

vi.mock('@/features/admin/catalog/images', () => ({
  sweepStagedUploads: vi.fn(),
}))

import { GET } from './route'
import { reapAbandonedOrders } from '@/features/admin/orders/reaper'
import { sweepStagedUploads } from '@/features/admin/catalog/images'

const reapAbandonedOrdersMock = vi.mocked(reapAbandonedOrders)
const sweepStagedUploadsMock = vi.mocked(sweepStagedUploads)

const SECRET = 'cron_secret_xxx'

function makeRequest(authorization?: string | null): Request {
  const headers: Record<string, string> = {}
  if (authorization !== undefined && authorization !== null) headers.authorization = authorization
  return new Request('http://localhost/api/cron/reap-orders', { headers })
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.CRON_SECRET = SECRET
  // Default the sweep to a harmless, deterministic count so every
  // pre-existing test below (which doesn't care about it) keeps asserting
  // unchanged; the dedicated describe block further down overrides this.
  sweepStagedUploadsMock.mockResolvedValue(0)
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

it('correct Authorization header: calls the engine and responds 200 with the reaped count and the swept-image count', async () => {
  reapAbandonedOrdersMock.mockResolvedValue({ ok: true, reaped: 5 })
  sweepStagedUploadsMock.mockResolvedValue(2)

  const res = await GET(makeRequest(`Bearer ${SECRET}`))

  expect(res.status).toBe(200)
  expect(await res.json()).toEqual({ reaped: 5, sweptImages: 2 })
  expect(reapAbandonedOrdersMock).toHaveBeenCalledTimes(1)
  expect(sweepStagedUploadsMock).toHaveBeenCalledTimes(1)
})

it('engine returns ok:false: responds 500 with empty body, and never runs the image sweep', async () => {
  reapAbandonedOrdersMock.mockResolvedValue({ ok: false, error: 'error' })

  const res = await GET(makeRequest(`Bearer ${SECRET}`))

  expect(res.status).toBe(500)
  expect(await res.json()).toEqual({})
  expect(sweepStagedUploadsMock).not.toHaveBeenCalled()
})

describe('sweptImages (staged-upload sweep, best-effort second step)', () => {
  it('a sweep failure is isolated in its own try/catch: still 200 with the reaper result intact and sweptImages: 0, and logs', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    reapAbandonedOrdersMock.mockResolvedValue({ ok: true, reaped: 3 })
    sweepStagedUploadsMock.mockRejectedValue(new Error('storage unreachable'))

    const res = await GET(makeRequest(`Bearer ${SECRET}`))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ reaped: 3, sweptImages: 0 })
    expect(consoleErrorSpy).toHaveBeenCalled()

    consoleErrorSpy.mockRestore()
  })

  it('runs the sweep only after the reaper has already succeeded', async () => {
    const order: string[] = []
    reapAbandonedOrdersMock.mockImplementation(async () => {
      order.push('reap')
      return { ok: true, reaped: 0 }
    })
    sweepStagedUploadsMock.mockImplementation(async () => {
      order.push('sweep')
      return 0
    })

    await GET(makeRequest(`Bearer ${SECRET}`))

    expect(order).toEqual(['reap', 'sweep'])
  })
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
