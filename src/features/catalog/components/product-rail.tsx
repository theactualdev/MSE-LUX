import { Rail, RailItem } from '@/components/brand/rail'
import { ProductCard } from '@/features/catalog/components/product-card'
import type { Product } from '@/types/catalog'

/**
 * Horizontal product rail — the home page's alternative to `ProductGrid`.
 *
 * A SIBLING of `ProductGrid`, never a replacement: the category, collection,
 * search and PDP-related listings stay grids, because on a listing page seeing
 * everything at once IS the job. This exists only for the home page's curated
 * shelves, where the measured cost of a grid was severe — Best Sellers and New
 * Arrivals alone were 61% of the mobile page height (4,494px and 3,385px of a
 * 12,876px page), because a 1-column mobile grid of eight products is eight
 * full rows.
 *
 * The tradeoff, stated honestly: a rail shows roughly one and a half products
 * on a phone instead of eight stacked, so items past the right edge get fewer
 * views. That is the deliberate trade for a page a customer will actually
 * reach the bottom of.
 *
 * Empty state is the same block `ProductGrid` renders, not a scrolling track —
 * an empty horizontal scroller is a confusing piece of furniture.
 */
export function ProductRail({ products, label }: { products: Product[]; label: string }) {
  if (products.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-24 text-center">
        <p className="font-display text-lg text-foreground">No products to show yet</p>
        <p className="text-sm text-muted-foreground">Check back soon, or explore another category.</p>
      </div>
    )
  }

  return (
    <Rail label={label}>
      {products.map((product) => (
        // Narrower than the default rail item: product cards are the densest
        // thing on the page, so ~1.4 fit on a phone and ~4 on desktop — always
        // leaving the next card partly visible, which is the only cue a reader
        // gets that the row continues.
        <RailItem key={product.id} className="w-[70%] sm:w-[38%] lg:w-[23%]">
          <ProductCard product={product} />
        </RailItem>
      ))}
    </Rail>
  )
}
