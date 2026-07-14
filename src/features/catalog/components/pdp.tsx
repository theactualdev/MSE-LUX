'use client'

import { useState } from 'react'
import { Heart, RotateCcw, Share2, Truck } from 'lucide-react'
import { toast } from '@/components/providers/toaster'
import { Button } from '@/components/ui/button'
import { AddToCart } from '@/features/cart/components/add-to-cart'
import { PriceDisplay } from '@/features/catalog/components/price-display'
import { ProductGallery } from '@/features/catalog/components/product-gallery'
import { QuantityStepper } from '@/features/catalog/components/quantity-stepper'
import { RecentlyViewedTracker } from '@/features/catalog/components/recently-viewed-tracker'
import {
  VariantSelector,
  type OptionState,
  type VariantSelectorChange,
} from '@/features/catalog/components/variant-selector'
import { useWishlistStore } from '@/features/wishlist/store'
import { cn } from '@/lib/utils'
import type { Product, ProductVariant } from '@/types/catalog'

interface PdpProps {
  product: Product
  className?: string
}

/**
 * Client-composed Product Detail Page: gallery, name/price, variant + qty
 * selection, add-to-cart, wishlist and share actions, shipping/returns and
 * specification info, and the recently-viewed tracker. Selected-variant and
 * quantity state live here so `PriceDisplay`, `AddToCart`, and the quantity
 * bound (`selectedVariant.inventory`) all stay in sync with one selection.
 */
export function Pdp({ product, className }: PdpProps) {
  const [optionState, setOptionState] = useState<OptionState>({})
  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | undefined>(undefined)
  const [qty, setQty] = useState(1)

  const isWishlisted = useWishlistStore((state) => state.has(product.id))
  const toggleWishlist = useWishlistStore((state) => state.toggle)

  const requiresVariant = product.optionTypes.length > 0
  const maxQty = requiresVariant ? selectedVariant?.inventory : product.inventory
  const wishlistLabel = `${isWishlisted ? 'Remove' : 'Add'} ${product.name} ${isWishlisted ? 'from' : 'to'} wishlist`

  const handleVariantChange = ({ options, variant }: VariantSelectorChange) => {
    const nextState: OptionState = {}
    for (const option of options) nextState[option.name] = option.value
    setOptionState(nextState)
    setSelectedVariant(variant)
    setQty(1)
  }

  const handleShare = async () => {
    const shareData = {
      title: product.name,
      text: product.shortDescription,
      url: typeof window !== 'undefined' ? window.location.href : undefined,
    }

    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share(shareData)
      } catch {
        // Shopper cancelled the native share sheet — nothing to do.
      }
      return
    }

    if (typeof navigator !== 'undefined' && navigator.clipboard && shareData.url) {
      await navigator.clipboard.writeText(shareData.url)
      toast({ title: 'Link copied', description: 'Product link copied to clipboard.' })
    }
  }

  return (
    <div className={cn('grid grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-12', className)}>
      <ProductGallery images={product.images} />

      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h1 className="font-display text-2xl font-semibold text-foreground sm:text-3xl">{product.name}</h1>
          <PriceDisplay product={product} variant={selectedVariant} className="text-lg" />
        </div>

        <p className="text-sm text-muted-foreground sm:text-base">{product.shortDescription}</p>

        <VariantSelector product={product} optionState={optionState} onChange={handleVariantChange} />

        <QuantityStepper value={qty} onChange={setQty} max={maxQty} />

        <div className="flex flex-col gap-3 sm:flex-row">
          <AddToCart product={product} selectedVariant={selectedVariant} qty={qty} className="flex-1" />
          <div className="flex gap-3">
            <Button
              type="button"
              variant="outline"
              size="icon-xl"
              aria-pressed={isWishlisted}
              aria-label={wishlistLabel}
              onClick={() => toggleWishlist(product.id)}
            >
              <Heart aria-hidden="true" className={cn('size-5', isWishlisted && 'fill-accent text-accent')} />
            </Button>
            <Button type="button" variant="outline" size="icon-xl" aria-label="Share this product" onClick={handleShare}>
              <Share2 aria-hidden="true" className="size-5" />
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-3 rounded-xl bg-muted p-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Truck aria-hidden="true" className="size-4 shrink-0" />
            <span>Complimentary shipping on orders over ₦150,000.</span>
          </div>
          <div className="flex items-center gap-2">
            <RotateCcw aria-hidden="true" className="size-4 shrink-0" />
            <span>Free returns within 30 days of delivery.</span>
          </div>
        </div>

        <details className="group rounded-xl border border-border p-4">
          <summary className="cursor-pointer font-medium text-foreground marker:content-none">Specifications</summary>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Material</dt>
            <dd className="text-foreground">{product.material}</dd>
            <dt className="text-muted-foreground">SKU</dt>
            <dd className="text-foreground">{selectedVariant?.sku ?? product.sku}</dd>
          </dl>
        </details>

        <RecentlyViewedTracker productId={product.id} />
      </div>
    </div>
  )
}
