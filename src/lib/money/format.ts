import type { Money } from '@/types/money'

/** Formats minor units as a localized currency string. Assumes 2 minor digits. */
export function formatMoney(money: Money, locale?: string): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: money.currency,
  }).format(money.amountMinor / 100)
}
