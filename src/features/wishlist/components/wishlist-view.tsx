'use client'

import Link from 'next/link'
import { Heart } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ProductGrid } from '@/features/catalog/components/product-grid'
import { getProductById } from '@/features/catalog/lib/selectors'
import { useHydrated } from '@/features/cart/use-hydrated'
import { useWishlistStore } from '@/features/wishlist/store'
import { cn } from '@/lib/utils'
import type { Product } from '@/types/catalog'

/**
 * Full `/wishlist` page body: saved products resolved from the persisted
 * wishlist store, plus a count line and a clear action.
 *
 * Gated on `useHydrated` — the server render (and the client's first paint,
 * before `useSyncExternalStore` reports hydration) always shows the neutral
 * skeleton below, matching the server markup exactly. Only once hydrated do
 * we read the persisted `useWishlistStore` state, so there is never a
 * server/client mismatch for the (always empty, on the server) wishlist.
 */
export function WishlistView() {
  const hydrated = useHydrated()
  const ids = useWishlistStore((s) => s.ids)
  const clear = useWishlistStore((s) => s.clear)

  if (!hydrated) {
    return (
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-hidden="true">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="aspect-[4/5] w-full rounded-xl" />
        ))}
      </div>
    )
  }

  // Defensive: an id may point at a product that's been removed from the
  // catalog since it was saved. Drop it silently rather than crashing.
  const products = ids
    .map((id) => getProductById(id))
    .filter((product): product is Product => Boolean(product))

  if (products.length === 0) {
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

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {products.length} saved {products.length === 1 ? 'item' : 'items'}
        </p>
        <Button type="button" variant="outline" size="sm" onClick={() => clear()}>
          Clear wishlist
        </Button>
      </div>
      <ProductGrid products={products} />
    </div>
  )
}
