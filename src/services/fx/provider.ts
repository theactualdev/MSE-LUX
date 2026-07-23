import 'server-only'
import type { FxRateProvider } from '@/lib/money/fx'
import type { FxRates } from '@/types/money'
import { SUPPORTED_CURRENCIES, isFxDerived } from '@/features/currency/lib/currencies'
import { BACKSTOP_USD_RATES } from './backstop'

// Re-exported so callers (e.g. the FX API route) can import both the live
// provider and the backstop rates from this one module.
export { BACKSTOP_USD_RATES }

const FX_ENDPOINT = 'https://open.er-api.com/v6/latest/USD'
const FX_CURRENCIES = SUPPORTED_CURRENCIES.filter(isFxDerived)

/** Free, no-key, daily-updated USD-base FX rate feed. */
export const openErApiFxProvider: FxRateProvider = {
  async getUsdRates(): Promise<FxRates> {
    const res = await fetch(FX_ENDPOINT, { next: { revalidate: 86_400 } })
    if (!res.ok) throw new Error(`FX fetch failed: ${res.status}`)
    const body = (await res.json()) as { rates?: Record<string, unknown> }
    const out: FxRates = {}
    for (const code of FX_CURRENCIES) {
      const rate = body.rates?.[code]
      if (typeof rate === 'number' && Number.isFinite(rate) && rate > 0) out[code] = rate
    }
    return out
  },
}

/** Picks live rates when available, else falls back to the committed backstop so a price can never blank. */
export function pickFxRates(fetched: FxRates | null): { rates: FxRates; source: 'live' | 'backstop' } {
  return fetched ? { rates: fetched, source: 'live' } : { rates: BACKSTOP_USD_RATES, source: 'backstop' }
}
