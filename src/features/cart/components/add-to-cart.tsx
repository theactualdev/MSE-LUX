'use client'

import { Button } from '@/components/ui/button'
import { useCart } from '@/features/cart/use-cart'
import { cn } from '@/lib/utils'
import { useUiStore } from '@/stores/ui'
import type { Product, ProductVariant } from '@/types/catalog'

interface AddToCartProps {
  product: Product
  selectedVariant?: ProductVariant
  qty?: number
  className?: string
}

/**
 * Primary "Add to bag" PDP action. Disabled until a required variant is
 * selected, and again if the resolved selection — the variant for
 * variant-based products, the product itself otherwise — has no inventory.
 */
export function AddToCart({ product, selectedVariant, qty = 1, className }: AddToCartProps) {
  const { add } = useCart()

  const requiresVariant = product.optionTypes.length > 0
  const variantMissing = requiresVariant && !selectedVariant
  const inventory = requiresVariant ? (selectedVariant?.inventory ?? 0) : product.inventory
  const outOfStock = !variantMissing && inventory <= 0
  const disabled = variantMissing || outOfStock

  const handleClick = () => {
    if (disabled) return
    add(product.id, selectedVariant?.id, qty)
    useUiStore.getState().openCartDrawer()
  }

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <Button type="button" disabled={disabled} onClick={handleClick} className="w-full">
        Add to bag
      </Button>
      {variantMissing ? (
        <p role="status" className="text-sm text-muted-foreground">
          Select an option to continue.
        </p>
      ) : outOfStock ? (
        <p role="status" className="text-sm text-destructive">
          This option is currently out of stock.
        </p>
      ) : null}
    </div>
  )
}
