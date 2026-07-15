import type { Money } from '@/types/money'
import type { CartLine } from '@/features/cart/lib/lines'
import { TAX_RATE } from '@/features/cart/lib/shipping'

export interface CartSummary {
  subtotal: Money
  shipping: Money
  tax: Money
  total: Money
}

export function computeCartSummary(lines: CartLine[], shipping: Money): CartSummary {
  const subtotalAmountMinor = lines.reduce((sum, line) => sum + line.lineTotal.amountMinor, 0)
  const taxAmountMinor = Math.round(subtotalAmountMinor * TAX_RATE)
  const totalAmountMinor = subtotalAmountMinor + shipping.amountMinor + taxAmountMinor

  return {
    subtotal: { amountMinor: subtotalAmountMinor, currency: 'NGN' },
    shipping: { amountMinor: shipping.amountMinor, currency: 'NGN' },
    tax: { amountMinor: taxAmountMinor, currency: 'NGN' },
    total: { amountMinor: totalAmountMinor, currency: 'NGN' },
  }
}
