import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Container } from '@/components/brand/container'
import { SectionHeading } from '@/components/brand/section-heading'
import { JsonLd } from '@/components/seo/json-ld'
import { Pdp } from '@/features/catalog/components/pdp'
import { ProductGrid } from '@/features/catalog/components/product-grid'
import { RecentlyViewedShelf } from '@/features/catalog/components/recently-viewed-shelf'
import {
  getAllProducts,
  getCategoryBySlug,
  getProductBySlug,
  getRelatedProducts,
  getSubcategory,
} from '@/features/catalog/server/selectors'
import { absoluteUrl, breadcrumbJsonLd, productJsonLd } from '@/lib/seo'
import type { Product } from '@/types/catalog'

/** Number of related products shown below the PDP. */
const RELATED_PRODUCTS_LIMIT = 4

// ISR: catalog is effectively static until the Phase 8 admin exists; hourly
// revalidation propagates seed edits without a rebuild. (Route-segment revalidate
// per node_modules/next/dist/docs/01-app/02-guides/caching-without-cache-components.md)
export const revalidate = 3600

interface ProductPageProps {
  params: Promise<{ slug: string }>
}

export async function generateStaticParams() {
  return (await getAllProducts()).map((product) => ({ slug: product.slug }))
}

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const { slug } = await params
  const product = await getProductBySlug(slug)
  if (!product) return {}

  const title = product.seo.title ?? product.name
  const description = product.seo.description ?? product.shortDescription
  const url = absoluteUrl(`/products/${slug}`)
  const heroImage = absoluteUrl(product.images[0]?.src ?? '/og-default.png')

  return {
    title,
    description,
    // Per-page override of the storefront layout's OG defaults — the layout
    // deliberately omits `url`/`images` (see its comment) because those are
    // meaningful only per-page, not per-site.
    alternates: { canonical: `/products/${slug}` },
    openGraph: {
      type: 'website',
      title,
      description,
      url,
      images: [heroImage],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [heroImage],
    },
  }
}

/**
 * Home → category → (subcategory) → product, skipping any crumb whose
 * category/subcategory lookup misses rather than rendering an "undefined" name.
 */
async function buildBreadcrumbTrail(product: Product): Promise<Array<{ name: string; path: string }>> {
  const trail: Array<{ name: string; path: string }> = [{ name: 'Home', path: '/' }]

  const category = await getCategoryBySlug(product.categorySlug)
  if (category) {
    trail.push({ name: category.name, path: `/${product.categorySlug}` })

    if (product.subcategorySlug) {
      const subcategory = await getSubcategory(product.categorySlug, product.subcategorySlug)
      if (subcategory) {
        trail.push({ name: subcategory.name, path: `/${product.categorySlug}/${product.subcategorySlug}` })
      }
    }
  }

  trail.push({ name: product.name, path: `/products/${product.slug}` })
  return trail
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { slug } = await params
  const product = await getProductBySlug(slug)
  if (!product) notFound()

  const related = await getRelatedProducts(product, RELATED_PRODUCTS_LIMIT)
  const breadcrumbTrail = await buildBreadcrumbTrail(product)

  return (
    <Container className="flex flex-col gap-16 py-12 sm:py-16">
      {/*
       * Structured data is authored in NGN (the store's home currency), not
       * the visitor's displayed currency. JSON-LD must be deterministic and
       * page-cacheable (this route is ● SSG); the displayed currency is
       * derived client-side per visitor, so pinning to it would either force
       * this page dynamic or bake a currency into the cached HTML that
       * doesn't match what a later visitor actually sees.
       */}
      <JsonLd data={productJsonLd(product, 'NGN')} />
      <JsonLd data={breadcrumbJsonLd(breadcrumbTrail)} />

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
