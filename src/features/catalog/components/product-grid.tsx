import { ProductCard } from '@/features/catalog/components/product-card'
import type { Product } from '@/types/catalog'

interface ProductGridProps {
  products: Product[]
  className?: string
}

/**
 * Responsive product grid: 1 column on mobile, up to 4 on desktop, 8-pt
 * gaps throughout. Renders a tasteful empty state when there's nothing to show.
 */
export function ProductGrid({ products }: ProductGridProps) {
  if (products.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-24 text-center">
        <p className="font-display text-lg text-foreground">No products to show yet</p>
        <p className="text-sm text-muted-foreground">Check back soon, or explore another category.</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {products.map((product) => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  )
}
