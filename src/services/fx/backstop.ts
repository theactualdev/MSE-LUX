import type { FxRates } from '@/types/money'

// USD-base backstop rates (approx, 2026-07). This is a hand-refreshed,
// committed snapshot that exists ONLY to prevent a blank price when the live
// FX source and the Next data cache are both unavailable. It is never the
// primary source of truth — refresh it by hand occasionally until an ops
// path exists for keeping it current.
export const BACKSTOP_USD_RATES: FxRates = { GBP: 0.79, EUR: 0.92, CAD: 1.37, GHS: 15.5, ZAR: 18.2, KES: 129 }
