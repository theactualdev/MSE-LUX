'use client'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'
import { useDisplayCurrency, useFxRates } from '@/features/currency/context'
import { resolveProductPrice } from '@/features/catalog/lib/pricing'
import type { Product, ProductVariant } from '@/types/catalog'

interface PriceDisplayProps {
  product: Product
  variant?: ProductVariant
  className?: string
}

// Reserves horizontal space for the price digits so the client-side ₦→currency
// correction (server renders NGN; the client swaps in the viewer's currency once
// it resolves) changes the number in place instead of reflowing surrounding layout.
const PRICE_WIDTH = 'inline-block min-w-[5ch] tabular-nums'

/** Renders a product's price in the viewer's display currency, with sale pricing struck-through when present. */
export function PriceDisplay({ product, variant, className }: PriceDisplayProps) {
  const currency = useDisplayCurrency()
  const rates = useFxRates()
  const { price, sale } = resolveProductPrice(product, variant, currency, rates)

  if (sale) {
    return (
      <span className={cn('flex items-baseline gap-2', className)}>
        <span className={cn('font-medium text-accent', PRICE_WIDTH)}>{formatMoney(sale)}</span>
        <span className={cn('text-sm text-muted-foreground line-through', PRICE_WIDTH)}>{formatMoney(price)}</span>
      </span>
    )
  }

  return <span className={cn('font-medium text-foreground', PRICE_WIDTH, className)}>{formatMoney(price)}</span>
}
