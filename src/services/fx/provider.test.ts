import { afterEach, describe, expect, it, vi } from 'vitest'
import { openErApiFxProvider, BACKSTOP_USD_RATES, pickFxRates } from './provider'

afterEach(() => vi.unstubAllGlobals())

describe('openErApiFxProvider.getUsdRates', () => {
  it('returns only the supported FX currencies with finite positive rates', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ result: 'success', rates: { GBP: 0.79, EUR: 0.92, CAD: 1.37, GHS: 15.5, ZAR: 18.2, KES: 129, JPY: 150, NGN: 1600 } }),
    }))
    const rates = await openErApiFxProvider.getUsdRates()
    expect(Object.keys(rates).sort()).toEqual(['CAD', 'EUR', 'GBP', 'GHS', 'KES', 'ZAR']) // no JPY/NGN/USD
    expect(rates.GBP).toBe(0.79)
  })
  it('drops non-finite or non-positive rates', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ result: 'success', rates: { GBP: 0, EUR: -1, CAD: 'x', ZAR: 18 } }) }))
    const rates = await openErApiFxProvider.getUsdRates()
    expect(rates).toEqual({ ZAR: 18 })
  })
  it('throws on a non-ok response so the caller can fall back', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }))
    await expect(openErApiFxProvider.getUsdRates()).rejects.toThrow()
  })
})

describe('pickFxRates', () => {
  it('uses fetched rates when present', () => {
    expect(pickFxRates({ GBP: 0.8 })).toEqual({ rates: { GBP: 0.8 }, source: 'live' })
  })
  it('falls back to the committed backstop when fetched is null', () => {
    expect(pickFxRates(null)).toEqual({ rates: BACKSTOP_USD_RATES, source: 'backstop' })
  })
})
