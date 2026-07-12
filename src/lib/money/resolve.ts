import type { Currency, FxRates, Money, PriceSet } from '@/types/money'

/**
 * Chooses the display price by viewer currency:
 *  - 'NGN' -> the admin-authored naira price
 *  - 'USD' -> the admin-authored dollar price
 *  - other -> the authored USD price converted via FX (display only)
 * Assumes FX-target currencies use 2 minor digits (documented Phase 1 limitation).
 */
export function resolveDisplayPrice(prices: PriceSet, target: Currency, fx: FxRates): Money {
  if (target === 'NGN') return prices.ngn
  if (target === 'USD') return prices.usd

  const rate = fx[target]
  if (!rate || rate <= 0) {
    throw new Error(`resolveDisplayPrice: missing or invalid FX rate for "${target}"`)
  }
  return { amountMinor: Math.round(prices.usd.amountMinor * rate), currency: target }
}
