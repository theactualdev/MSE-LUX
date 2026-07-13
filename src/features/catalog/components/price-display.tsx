'use client'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'
import { useDisplayCurrency } from '@/hooks/use-display-currency'
import { resolveProductPrice } from '@/features/catalog/lib/pricing'
import type { Product, ProductVariant } from '@/types/catalog'

interface PriceDisplayProps {
  product: Product
  variant?: ProductVariant
  className?: string
}

/** Renders a product's price in the viewer's display currency, with sale pricing struck-through when present. */
export function PriceDisplay({ product, variant, className }: PriceDisplayProps) {
  const currency = useDisplayCurrency()
  const { price, sale } = resolveProductPrice(product, variant, currency)

  if (sale) {
    return (
      <span className={cn('flex items-baseline gap-2', className)}>
        <span className="font-medium text-accent">{formatMoney(sale, 'en-NG')}</span>
        <span className="text-sm text-muted-foreground line-through">{formatMoney(price, 'en-NG')}</span>
      </span>
    )
  }

  return <span className={cn('font-medium text-foreground', className)}>{formatMoney(price, 'en-NG')}</span>
}
