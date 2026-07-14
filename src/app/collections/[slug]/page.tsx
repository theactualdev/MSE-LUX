import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Container } from '@/components/brand/container'
import { SectionHeading } from '@/components/brand/section-heading'
import { ProductGrid } from '@/features/catalog/components/product-grid'
import { getAllCollections, getCollectionBySlug, getProductsInCollection } from '@/features/catalog/lib/selectors'

interface CollectionPageProps {
  params: Promise<{ slug: string }>
}

export async function generateStaticParams() {
  return getAllCollections().map((collection) => ({ slug: collection.slug }))
}

export async function generateMetadata({ params }: CollectionPageProps): Promise<Metadata> {
  const { slug } = await params
  const collection = getCollectionBySlug(slug)
  if (!collection) return {}

  return {
    title: collection.name,
    description: collection.description ?? `Shop the ${collection.name} collection at MSE Lux.`,
  }
}

export default async function CollectionPage({ params }: CollectionPageProps) {
  const { slug } = await params
  const collection = getCollectionBySlug(slug)
  if (!collection) notFound()

  const products = getProductsInCollection(slug)

  return (
    <Container className="flex flex-col gap-8 py-12 sm:py-16">
      <SectionHeading title={collection.name} subtitle={collection.description} as="h1" />
      <ProductGrid products={products} />
    </Container>
  )
}
