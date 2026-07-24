'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Heart } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ProductCard } from '@/features/catalog/components/product-card'
import { resolveProductsByIds } from '@/features/catalog/server/resolve-products'
import { AddToCart } from '@/features/cart/components/add-to-cart'
import { useHydrated } from '@/features/cart/use-hydrated'
import { useWishlist } from '@/features/wishlist/use-wishlist'
import { cn } from '@/lib/utils'
import type { Product } from '@/types/catalog'

/**
 * Full `/wishlist` page body: saved products resolved from the unified
 * `useWishlist()` hook (guest localStorage or, signed-in, the shared server
 * store), plus a count line and a clear action.
 *
 * Gated on `useHydrated` — the server render (and the client's first paint,
 * before `useSyncExternalStore` reports hydration) always shows the neutral
 * skeleton below, matching the server markup exactly. Also held on the
 * skeleton while `useWishlist().isLoading` (signed-in ids still loading from
 * the server) or while the current, non-empty id set hasn't finished
 * resolving to products yet — otherwise either would flash the empty state
 * before the real contents are known, exactly like `CartView`.
 *
 * `ids` never carry full products (see `use-wishlist.ts`), so they're
 * resolved to `Product[]` via the `resolveProductsByIds` server action —
 * mirroring `useCart`'s own id-set-keyed resolution effect. That action
 * already drops ids that no longer resolve to a catalog product, so the
 * resolved list is inherently filtered — no separate defensive filter
 * needed here.
 *
 * The hook's surface intentionally has no `clear` (see its module doc) — a
 * "clear wishlist" is just toggling every currently-saved id off, so that's
 * implemented locally rather than reaching into the raw stores directly.
 */
export function WishlistView() {
  const hydrated = useHydrated()
  const { ids, isLoading, toggle } = useWishlist()

  const idsKey = useMemo(() => Array.from(new Set(ids)).sort().join(','), [ids])

  const [products, setProducts] = useState<Product[]>([])
  const [resolvedKey, setResolvedKey] = useState('')

  useEffect(() => {
    if (idsKey === '') return
    const idList = idsKey.split(',')
    let active = true
    resolveProductsByIds(idList)
      .then((resolved) => {
        if (active) {
          setProducts(resolved)
          setResolvedKey(idsKey)
        }
      })
      .catch((error) => {
        // Don't leave the page stuck on a skeleton if resolution rejects —
        // mark this id set resolved (the grid then shows whatever resolved, or
        // the empty state) and surface the cause instead of swallowing it.
        console.error('[WishlistView] resolveProductsByIds failed', error)
        if (active) setResolvedKey(idsKey)
      })
    return () => {
      active = false
    }
  }, [idsKey])

  const productsResolved = idsKey === '' || resolvedKey === idsKey
  const resolving = isLoading || !productsResolved

  if (!hydrated || resolving) {
    return (
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-hidden="true">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="aspect-[4/5] w-full rounded-xl" />
        ))}
      </div>
    )
  }

  // `products` is keyed by the id set resolution last ran for; deriving the
  // displayed list by looking each current id up in it (rather than
  // rendering `products` directly) keeps a stale/superseded resolution from
  // ever being shown, and naturally yields `[]` when `ids` is empty.
  const productById = new Map(products.map((p) => [p.id, p]))
  const resolvedProducts = ids
    .map((id) => productById.get(id))
    .filter((product): product is Product => Boolean(product))

  if (resolvedProducts.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Heart aria-hidden="true" className="size-10 text-muted-foreground" />
        <h2 className="font-display text-xl font-medium text-foreground">Your wishlist is empty</h2>
        <p className="max-w-sm text-sm text-muted-foreground">
          Save the pieces you love and find them here whenever you&rsquo;re ready.
        </p>
        <Link href="/collections" className={cn(buttonVariants(), 'mt-3')}>
          Explore collections
        </Link>
      </div>
    )
  }

  const handleClear = () => {
    for (const id of ids) toggle(id)
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {resolvedProducts.length} saved {resolvedProducts.length === 1 ? 'item' : 'items'}
        </p>
        <Button type="button" variant="outline" size="sm" onClick={handleClear}>
          Clear wishlist
        </Button>
      </div>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {resolvedProducts.map((product) => (
          <div key={product.id} className="flex flex-col gap-3">
            <ProductCard product={product} />
            {product.variants.length === 0 ? (
              <AddToCart product={product} qty={1} />
            ) : (
              <Link href={`/products/${product.slug}`} className={cn(buttonVariants({ variant: 'outline' }), 'w-full')}>
                Select options
              </Link>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
