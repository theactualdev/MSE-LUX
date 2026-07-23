'use client'

import { useEffect, useState } from 'react'
import { SectionHeading } from '@/components/brand/section-heading'
import { useHydrated } from '@/features/cart/use-hydrated'
import { ProductGrid } from '@/features/catalog/components/product-grid'
import { useRecentlyViewedStore } from '@/features/catalog/hooks/use-recently-viewed'
import { resolveProductsByIds } from '@/features/catalog/server/resolve-products'
import type { Product } from '@/types/catalog'

interface RecentlyViewedShelfProps {
  /** Omit the PDP's own product from its "recently viewed" shelf. */
  excludeProductId?: string
}

/**
 * Client-only shelf reading the persisted recently-viewed store. Gated on
 * `useHydrated` so the server-rendered (always-empty) markup matches the
 * initial client render before the store rehydrates from localStorage.
 *
 * The store only holds ids (most-recent-first, capped at 8); they're
 * resolved to `Product[]` via the `resolveProductsByIds` server action,
 * mirroring `WishlistView`'s id-key-keyed resolution effect.
 * `resolveProductsByIds` preserves input order and drops unknown ids, so the
 * resolved list is already in recency order — it's used as-is, unsorted.
 * Unlike cart/wishlist there's no empty state to flash: starting from `[]`
 * and rendering nothing until resolution completes is the correct UX here.
 *
 * `resolved` is keyed by whatever id set the effect last ran for; the
 * displayed list is derived by looking each currently-filtered id up in it
 * (rather than rendering `resolved` directly), so a stale/superseded
 * resolution is never shown and an id set that has gone back to empty (e.g.
 * the store was cleared) naturally yields `[]` without an extra render.
 */
export function RecentlyViewedShelf({ excludeProductId }: RecentlyViewedShelfProps) {
  const ids = useRecentlyViewedStore((state) => state.ids)
  const hydrated = useHydrated()

  const filteredIds = ids.filter((id) => id !== excludeProductId)
  const idsKey = filteredIds.join(',')

  const [resolved, setResolved] = useState<Product[]>([])

  useEffect(() => {
    if (idsKey === '') return
    const idList = idsKey.split(',')
    let active = true
    resolveProductsByIds(idList).then((products) => {
      if (active) setResolved(products)
    })
    return () => {
      active = false
    }
  }, [idsKey])

  const productById = new Map(resolved.map((product) => [product.id, product]))
  const products = filteredIds
    .map((id) => productById.get(id))
    .filter((product): product is Product => Boolean(product))

  if (!hydrated) return null
  if (products.length === 0) return null

  return (
    <div className="flex flex-col gap-6">
      <SectionHeading title="Recently viewed" as="h2" />
      <ProductGrid products={products} />
    </div>
  )
}
