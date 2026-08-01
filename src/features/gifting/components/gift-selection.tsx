'use client'

import { useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { PriceDisplay } from '@/features/catalog/components/price-display'
import {
  VariantSelector,
  type OptionState,
  type VariantSelectorChange,
} from '@/features/catalog/components/variant-selector'
import { cn } from '@/lib/utils'
import type { Product, ProductVariant } from '@/types/catalog'

/**
 * One buyer selection, exactly the shape `placeGiftOrder` expects
 * (`GiftSelection` in `@/features/gifting/gift-order`) — redeclared locally
 * rather than imported so this client component never references a
 * `server-only` module, even at the type level.
 */
export interface GiftSelectionItem {
  productId: string
  variantId: string | null
}

interface EntryState {
  checked: boolean
  optionState: OptionState
  variant: ProductVariant | undefined
}

const EMPTY_ENTRY: EntryState = { checked: false, optionState: {}, variant: undefined }

interface GiftSelectionProps {
  /** The share token, used only to build the checkout route — never read for anything else here. */
  token: string
  products: Product[]
}

/**
 * True when NOTHING about this product can be bought, regardless of which
 * option the buyer might pick. A variantless product is out of stock at its
 * own `inventory`; a variant product is out of stock only when every one of
 * its variants is — `.every()` on an empty `variants` array is `true`, which
 * correctly also catches the (malformed) case of a variant product with no
 * variants at all.
 */
function isOutOfStock(product: Product): boolean {
  if (product.optionTypes.length === 0) return product.inventory <= 0
  return product.variants.every((variant) => variant.inventory <= 0)
}

/**
 * Buyer-side item picker on the public share page. The ordinary wishlist
 * view sends a variant product to the PDP for "Select options" — that page's
 * add-to-cart would add to the BUYER's own cart, which a gift flow cannot
 * use, so this component gets its own inline `VariantSelector` (the same one
 * the PDP uses) instead.
 *
 * A variant product's checkbox is disabled — with a visible hint — until a
 * full, in-stock variant is resolved. An out-of-stock entry (no sellable
 * variant, or a variantless product with zero inventory) can never be
 * checked, variant or not. "Continue" stays disabled until at least one item
 * is checked.
 *
 * Submitting hands the picked `{ productId, variantId }` pairs to the gift
 * checkout route as a query param rather than through any client-held store:
 * the checkout page is a server component exactly like this one, so
 * `searchParams` is the one channel both ends can read without inventing
 * cross-page client state. Nothing here is trusted regardless —
 * `placeGiftOrder` re-validates every selection against the share's own
 * `productIds` server-side before an order is ever created.
 */
export function GiftSelection({ token, products }: GiftSelectionProps) {
  const router = useRouter()
  const [entries, setEntries] = useState<Record<string, EntryState>>({})

  const entryFor = (productId: string): EntryState => entries[productId] ?? EMPTY_ENTRY

  const setEntry = (productId: string, next: Partial<EntryState>) => {
    setEntries((prev) => ({ ...prev, [productId]: { ...entryFor(productId), ...next } }))
  }

  const selections: GiftSelectionItem[] = products
    .filter((product) => entryFor(product.id).checked)
    .map((product) => ({ productId: product.id, variantId: entryFor(product.id).variant?.id ?? null }))

  const handleContinue = () => {
    if (selections.length === 0) return
    const query = encodeURIComponent(JSON.stringify(selections))
    router.push(`/wishlist/shared/${token}/checkout?selections=${query}`)
  }

  return (
    <div className="flex flex-col gap-8">
      <ul className="flex flex-col gap-6">
        {products.map((product) => {
          const entry = entryFor(product.id)
          const hasVariants = product.optionTypes.length > 0
          const outOfStock = isOutOfStock(product)
          const variantMissing = hasVariants && !outOfStock && !entry.variant
          const disabled = outOfStock || variantMissing
          const hero = product.images[0]
          const checkboxId = `gift-item-${product.id}`

          return (
            <li
              key={product.id}
              className="flex flex-col gap-4 rounded-xl border border-border p-4 sm:flex-row sm:items-start sm:justify-between"
            >
              <div className="flex flex-1 gap-4">
                <div className="relative size-20 shrink-0 overflow-hidden rounded-lg bg-muted">
                  {hero ? <Image src={hero.src} alt={hero.alt} fill sizes="80px" className="object-cover" /> : null}
                </div>
                <div className="flex flex-1 flex-col gap-2">
                  <p className="font-display text-base font-medium text-foreground">{product.name}</p>
                  <PriceDisplay product={product} variant={entry.variant} />
                  {hasVariants && !outOfStock ? (
                    <VariantSelector
                      product={product}
                      optionState={entry.optionState}
                      onChange={({ options, variant }: VariantSelectorChange) => {
                        const nextOptionState: OptionState = {}
                        for (const option of options) nextOptionState[option.name] = option.value
                        // A change that unresolves the variant (e.g. one option
                        // type re-picked before the rest match again) must also
                        // uncheck this entry — it can no longer be a valid gift
                        // selection with no variant behind it.
                        setEntry(product.id, {
                          optionState: nextOptionState,
                          variant,
                          checked: variant ? entry.checked : false,
                        })
                      }}
                    />
                  ) : null}
                  {outOfStock ? (
                    <p className="text-sm text-destructive">Out of stock</p>
                  ) : variantMissing ? (
                    <p className="text-sm text-muted-foreground">Choose an option to add this to the gift.</p>
                  ) : null}
                </div>
              </div>
              <label
                htmlFor={checkboxId}
                className={cn(
                  'flex shrink-0 items-center gap-2 text-sm font-medium text-foreground',
                  disabled && 'text-muted-foreground',
                )}
              >
                <input
                  type="checkbox"
                  id={checkboxId}
                  checked={entry.checked}
                  disabled={disabled}
                  // Explicit `aria-label` (rather than relying on the wrapping
                  // `<label>`'s own text) so each checkbox in the list has a
                  // distinct accessible name — "Add to gift" repeated
                  // unqualified across every row would be indistinguishable
                  // to a screen reader user.
                  aria-label={`Add ${product.name} to the gift`}
                  onChange={(event) => setEntry(product.id, { checked: event.target.checked })}
                />
                Add to gift
              </label>
            </li>
          )
        })}
      </ul>
      <Button type="button" disabled={selections.length === 0} onClick={handleContinue} className="self-start">
        Continue
      </Button>
    </div>
  )
}
