import type { Money, Currency } from '@/types/money'
import type { CartLine } from '@/features/cart/lib/lines'
import { TAX_RATE } from '@/features/cart/lib/shipping'

export interface CartSummary {
  subtotal: Money
  shipping: Money
  tax: Money
  total: Money
}

/**
 * Computes the cart summary entirely in `currency` (the charge currency),
 * summing straight from the lines' authored minor units — no FX conversion.
 * Callers must pass lines and shipping already authored in `currency`.
 */
export function computeCartSummary(lines: CartLine[], shipping: Money, currency: Currency): CartSummary {
  const subtotalAmountMinor = lines.reduce((sum, line) => sum + line.lineTotal.amountMinor, 0)
  const taxAmountMinor = Math.round(subtotalAmountMinor * TAX_RATE)
  const totalAmountMinor = subtotalAmountMinor + shipping.amountMinor + taxAmountMinor

  return {
    subtotal: { amountMinor: subtotalAmountMinor, currency },
    shipping: { amountMinor: shipping.amountMinor, currency },
    tax: { amountMinor: taxAmountMinor, currency },
    total: { amountMinor: totalAmountMinor, currency },
  }
}
