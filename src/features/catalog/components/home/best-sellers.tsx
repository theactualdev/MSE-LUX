import Link from 'next/link'
import { Container } from '@/components/brand/container'
import { SectionHeading } from '@/components/brand/section-heading'
import { ProductGrid } from '@/features/catalog/components/product-grid'
import { getBestSellers } from '@/features/catalog/server/selectors'

/** Tasteful cap on how many best-sellers ever render in this row, however many the catalog has. */
const BEST_SELLERS_COUNT = 8

/** Section heading + "view all" link + a grid of the shop's best-selling products. */
export async function BestSellers() {
  const products = (await getBestSellers()).slice(0, BEST_SELLERS_COUNT)
  if (products.length === 0) return null

  return (
    <Container className="flex flex-col gap-8 py-12 sm:py-16">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <SectionHeading title="Best Sellers" subtitle="The pieces our customers keep coming back for." />
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
