import type { Money } from '@/types/money'
import { localeForCurrency } from '@/features/currency/lib/currencies'

/** Formats integer minor units as a localized currency string; locale defaults to one matching the currency. */
export function formatMoney(money: Money, locale?: string): string {
  return new Intl.NumberFormat(locale ?? localeForCurrency(money.currency), {
    style: 'currency',
    currency: money.currency,
  }).format(money.amountMinor / 100)
}
