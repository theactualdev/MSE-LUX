import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Container } from '@/components/brand/container'
import { SectionHeading } from '@/components/brand/section-heading'
import { Pdp } from '@/features/catalog/components/pdp'
import { ProductGrid } from '@/features/catalog/components/product-grid'
import { RecentlyViewedShelf } from '@/features/catalog/components/recently-viewed-shelf'
import { getAllProducts, getProductBySlug, getRelatedProducts } from '@/features/catalog/lib/selectors'

/** Number of related products shown below the PDP. */
const RELATED_PRODUCTS_LIMIT = 4

interface ProductPageProps {
  params: Promise<{ slug: string }>
}

export async function generateStaticParams() {
  return getAllProducts().map((product) => ({ slug: product.slug }))
}

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const { slug } = await params
  const product = getProductBySlug(slug)
  if (!product) return {}

  return {
    title: product.seo.title ?? product.name,
    description: product.seo.description ?? product.shortDescription,
  }
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { slug } = await params
  const product = getProductBySlug(slug)
  if (!product) notFound()

  const related = getRelatedProducts(product, RELATED_PRODUCTS_LIMIT)

  return (
    <Container className="flex flex-col gap-16 py-12 sm:py-16">
      <Pdp product={product} />

      {related.length > 0 ? (
        <div className="flex flex-col gap-6">
          <SectionHeading title="You may also like" as="h2" />
          <ProductGrid products={related} />
        </div>
      ) : null}

      <RecentlyViewedShelf excludeProductId={product.id} />
    </Container>
  )
}
