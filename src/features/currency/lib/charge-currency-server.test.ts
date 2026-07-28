import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `next/headers` is mocked per the project idiom (`src/lib/rate-limit.test.ts`):
 * a `vi.fn()` standing in for `headers()`, resolved to a real `Headers`
 * instance per test so `.get('x-vercel-ip-country')` behaves exactly like
 * the framework's own header store.
 */

const headersMock = vi.fn()
vi.mock('next/headers', () => ({ headers: (...args: unknown[]) => headersMock(...args) }))

const { serverChargeCurrency } = await import('@/features/currency/lib/charge-currency-server')

function headerStore(entries: Record<string, string>) {
  const h = new Headers()
  for (const [key, value] of Object.entries(entries)) h.set(key, value)
  return h
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('serverChargeCurrency', () => {
  it('maps a Nigerian geo header to NGN', async () => {
    headersMock.mockResolvedValue(headerStore({ 'x-vercel-ip-country': 'NG' }))
    await expect(serverChargeCurrency()).resolves.toBe('NGN')
  })

  it('maps a US geo header to USD', async () => {
    headersMock.mockResolvedValue(headerStore({ 'x-vercel-ip-country': 'US' }))
    await expect(serverChargeCurrency()).resolves.toBe('USD')
  })

  it('maps a GB geo header to USD (only NG authors NGN; everything else charges USD)', async () => {
    headersMock.mockResolvedValue(headerStore({ 'x-vercel-ip-country': 'GB' }))
    await expect(serverChargeCurrency()).resolves.toBe('USD')
  })

  it('returns null when the country header is absent (local dev / non-Vercel)', async () => {
    headersMock.mockResolvedValue(headerStore({}))
    await expect(serverChargeCurrency()).resolves.toBeNull()
  })

  it('returns null, logging instead of throwing, when headers() itself throws', async () => {
    headersMock.mockRejectedValue(new Error('no request context'))
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(serverChargeCurrency()).resolves.toBeNull()
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[serverChargeCurrency] failed to read the geo header — falling back to null',
      expect.any(Error),
    )

    consoleErrorSpy.mockRestore()
  })
})
