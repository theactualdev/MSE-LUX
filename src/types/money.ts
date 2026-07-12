export type AuthoredCurrency = 'NGN' | 'USD'
// ISO 4217 code; NGN and USD are admin-authored, others are FX-derived for display.
export type Currency = AuthoredCurrency | (string & {})

export interface Money {
  /** Integer minor units (kobo for NGN, cents for USD). Never a float. */
  amountMinor: number
  currency: Currency
}

/** Two independently admin-authored prices. Neither is derived from the other. */
export interface PriceSet {
  ngn: Money
  usd: Money
}

/** Map of ISO currency code -> units of that currency per 1 USD. Must include the target. */
export type FxRates = Record<string, number>
