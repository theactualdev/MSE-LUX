import type { Currency } from '@/types/money'

export const SUPPORTED_CURRENCIES = ['NGN', 'USD', 'GBP', 'EUR', 'CAD', 'GHS', 'ZAR', 'KES'] as const
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number]
export const DEFAULT_CURRENCY: Currency = 'NGN'
const AUTHORED = new Set<Currency>(['NGN', 'USD'])

const EU_EUR = ['AT', 'BE', 'CY', 'DE', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PT', 'SI', 'SK']
const COUNTRY_TO_CURRENCY: Record<string, Currency> = {
  NG: 'NGN', US: 'USD', GB: 'GBP', CA: 'CAD', GH: 'GHS', ZA: 'ZAR', KE: 'KES',
  ...Object.fromEntries(EU_EUR.map((c) => [c, 'EUR'])),
}
const LOCALE: Record<SupportedCurrency, string> = {
  NGN: 'en-NG', USD: 'en-US', GBP: 'en-GB', EUR: 'en-IE', CAD: 'en-CA', GHS: 'en-GH', ZAR: 'en-ZA', KES: 'en-KE',
}

export function currencyForCountry(country: string | null | undefined): Currency {
  if (!country) return 'USD'
  return COUNTRY_TO_CURRENCY[country.toUpperCase()] ?? 'USD'
}
export function isSupportedCurrency(c: string): c is SupportedCurrency {
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(c)
}
export function isFxDerived(currency: Currency): boolean {
  return isSupportedCurrency(currency) && !AUTHORED.has(currency)
}
export function localeForCurrency(currency: Currency): string {
  return isSupportedCurrency(currency) ? LOCALE[currency] : 'en-US'
}
