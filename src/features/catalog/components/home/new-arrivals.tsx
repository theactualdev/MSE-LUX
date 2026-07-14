import Link from 'next/link'
import { Container } from '@/components/brand/container'
import { SectionHeading } from '@/components/brand/section-heading'
import { ProductGrid } from '@/features/catalog/components/product-grid'
import { getNewArrivals } from '@/features/catalog/lib/selectors'

/** Tasteful cap on how many new arrivals ever render in this row, however many the catalog has. */
const NEW_ARRIVALS_COUNT = 6

/** Section heading + "view all" link + a grid of the shop's newest products. */
export function NewArrivals() {
  const products = getNewArrivals().slice(0, NEW_ARRIVALS_COUNT)
  if (products.length === 0) return null

  return (
    <Container className="flex flex-col gap-8 py-12 sm:py-16">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <SectionHeading title="New Arrivals" subtitle="Fresh drops, hand-finished this season." />
        <Link
          href="/collections"
          className="text-sm font-medium text-foreground underline-offset-4 hover:underline"
        >
          View all
        </Link>
      </div>

      <ProductGrid products={products} />
    </Container>
  )
}
