'use client'

import Image from 'next/image'
import Link from 'next/link'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { QuantityStepper } from '@/features/catalog/components/quantity-stepper'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'
import type { CartLine } from '@/features/cart/lib/lines'

interface CartLineItemProps {
  line: CartLine
  /** Renders quantity/remove controls; used in the cart drawer and cart page, not order summaries. */
  editable?: boolean
  onQtyChange?: (quantity: number) => void
  onRemove?: () => void
  className?: string
}

/**
 * A single cart row: thumbnail, name (links to the PDP), variant summary,
 * unit price, and line total. Compact by default (drawer usage); pass
 * `editable` to add a quantity stepper and remove control (cart page).
 */
export function CartLineItem({ line, editable = false, onQtyChange, onRemove, className }: CartLineItemProps) {
  const { product, variant, image, quantity, unitPrice, lineTotal } = line
  const optionSummary = variant?.options.map((o) => o.value).join(' / ')

  return (
    <div className={cn('flex gap-4', className)}>
      <div className={cn('relative shrink-0 overflow-hidden rounded-xl bg-muted', editable ? 'size-24' : 'size-16')}>
        <Image src={image.src} alt={image.alt} fill sizes="96px" className="object-cover" />
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-start justify-between gap-2">
          <Link
            href={`/products/${product.slug}`}
            className="font-display text-sm font-medium leading-snug text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {product.name}
          </Link>

          {editable ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Remove ${product.name}`}
              onClick={onRemove}
              className="shrink-0 text-muted-foreground hover:text-destructive"
            >
              <Trash2 aria-hidden="true" className="size-4" />
            </Button>
          ) : null}
        </div>

        {optionSummary ? <p className="text-xs text-muted-foreground">{optionSummary}</p> : null}

        <div className="mt-auto flex items-center justify-between gap-2">
          {editable ? (
            <QuantityStepper
              value={quantity}
              onChange={(qty) => onQtyChange?.(qty)}
              max={variant?.inventory ?? product.inventory}
              label={`${product.name} quantity`}
            />
          ) : (
            <span className="text-xs text-muted-foreground">
              {quantity} × {formatMoney(unitPrice)}
            </span>
          )}

          <span className="text-sm font-medium text-foreground">{formatMoney(lineTotal)}</span>
        </div>
      </div>
    </div>
  )
}
