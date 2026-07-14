'use client'

import { SectionHeading } from '@/components/brand/section-heading'
import { useHydrated } from '@/features/cart/use-hydrated'
import { ProductGrid } from '@/features/catalog/components/product-grid'
import { useRecentlyViewedStore } from '@/features/catalog/hooks/use-recently-viewed'
import { getAllProducts } from '@/features/catalog/lib/selectors'
import type { Product } from '@/types/catalog'

interface RecentlyViewedShelfProps {
  /** Omit the PDP's own product from its "recently viewed" shelf. */
  excludeProductId?: string
}

/**
 * Client-only shelf reading the persisted recently-viewed store. Gated on
 * `useHydrated` so the server-rendered (always-empty) markup matches the
 * initial client render before the store rehydrates from localStorage.
 */
export function RecentlyViewedShelf({ excludeProductId }: RecentlyViewedShelfProps) {
  const ids = useRecentlyViewedStore((state) => state.ids)
  const hydrated = useHydrated()

  if (!hydrated) return null

  const catalog = getAllProducts()
  const products = ids
    .filter((id) => id !== excludeProductId)
    .map((id) => catalog.find((product) => product.id === id))
    .filter((product): product is Product => Boolean(product))

  if (products.length === 0) return null

  return (
    <div className="flex flex-col gap-6">
      <SectionHeading title="Recently viewed" as="h2" />
      <ProductGrid products={products} />
    </div>
  )
}
