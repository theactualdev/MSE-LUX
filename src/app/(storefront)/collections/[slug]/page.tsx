import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Container } from '@/components/brand/container'
import { SectionHeading } from '@/components/brand/section-heading'
import { JsonLd } from '@/components/seo/json-ld'
import { ProductGrid } from '@/features/catalog/components/product-grid'
import { getAllCollections, getCollectionBySlug, getProductsInCollection } from '@/features/catalog/server/selectors'
import { absoluteUrl, breadcrumbJsonLd } from '@/lib/seo'

interface CollectionPageProps {
  params: Promise<{ slug: string }>
}

// ISR: catalog is effectively static until the Phase 8 admin exists; hourly
// revalidation propagates seed edits without a rebuild. (Route-segment revalidate
// per node_modules/next/dist/docs/01-app/02-guides/caching-without-cache-components.md)
export const revalidate = 3600

export async function generateStaticParams() {
  return (await getAllCollections()).map((collection) => ({ slug: collection.slug }))
}

export async function generateMetadata({ params }: CollectionPageProps): Promise<Metadata> {
  const { slug } = await params
  const collection = await getCollectionBySlug(slug)
  if (!collection) return {}

  const title = collection.name
  const description = collection.description ?? `Shop the ${collection.name} collection at MSE Lux.`
  const url = absoluteUrl(`/collections/${slug}`)
  // A collection's `image` is optional. No `/og-default.png` fallback here —
  // the storefront layout (see its comment) deliberately stopped referencing
  // that path because it doesn't exist yet, and Facebook/LinkedIn cache a 404
  // image per-URL, so a pre-launch share would stay broken long after the
  // real file lands. When there's no image, omit `images` entirely.
  const heroImage = collection.image ? absoluteUrl(collection.image) : undefined

  return {
    title,
    description,
    alternates: { canonical: `/collections/${slug}` },
    openGraph: {
      type: 'website',
      title,
      description,
      url,
      ...(heroImage ? { images: [heroImage] } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      ...(heroImage ? { images: [heroImage] } : {}),
    },
  }
}

export default async function CollectionPage({ params }: CollectionPageProps) {
  const { slug } = await params
  const collection = await getCollectionBySlug(slug)
  if (!collection) notFound()

  const products = await getProductsInCollection(slug)
  const breadcrumbTrail = [
    { name: 'Home', path: '/' },
    { name: 'Collections', path: '/collections' },
    { name: collection.name, path: `/collections/${slug}` },
  ]

  return (
    <Container className="flex flex-col gap-8 py-12 sm:py-16">
      {/*
       * Structured data must be deterministic and page-cacheable (this route
       * is ISR-revalidated), so the breadcrumb trail is built from the
       * catalog data already fetched above rather than anything request-derived.
       */}
      <JsonLd data={breadcrumbJsonLd(breadcrumbTrail)} />

      <SectionHeading title={collection.name} subtitle={collection.description} as="h1" />
      <ProductGrid products={products} />
    </Container>
  )
}
