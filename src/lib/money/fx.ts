import type { FxRates } from '@/types/money'

/** Fetches USD-base FX rates. Implemented in a later phase (Phase 5). */
export interface FxRateProvider {
  getUsdRates(): Promise<FxRates>
}
