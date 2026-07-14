import { Suspense } from 'react'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Container } from '@/components/brand/container'
import { SectionHeading } from '@/components/brand/section-heading'
import { ProductGrid } from '@/features/catalog/components/product-grid'
import { ListingControls } from '@/features/catalog/components/listing-controls'
import { getAllCategories, getCategoryBySlug, getProductsByCategory } from '@/features/catalog/lib/selectors'
import { filterAndSortProducts, parseListingParams } from '@/features/catalog/lib/listing'

interface CategoryPageProps {
  params: Promise<{ category: string }>
  searchParams: Promise<Record<string, string | undefined>>
}

export async function generateStaticParams() {
  return getAllCategories().map((category) => ({ category: category.slug }))
}

export async function generateMetadata({ params }: CategoryPageProps): Promise<Metadata> {
  const { category: categorySlug } = await params
  const category = getCategoryBySlug(categorySlug)
  if (!category) return {}

  return {
    title: category.name,
    description: category.description ?? `Shop ${category.name} at MSE Lux.`,
  }
}

export default async function CategoryPage({ params, searchParams }: CategoryPageProps) {
  const { category: categorySlug } = await params
  const sp = await searchParams

  const category = getCategoryBySlug(categorySlug)
  if (!category) notFound()

  const products = filterAndSortProducts(getProductsByCategory(category.slug), parseListingParams(sp))

  return (
    <Container className="flex flex-col gap-8 py-12 sm:py-16">
      <SectionHeading title={category.name} subtitle={category.description} as="h1" />

      <Suspense fallback={null}>
        <ListingControls subcategories={category.subcategories} />
      </Suspense>

      <ProductGrid products={products} />
    </Container>
  )
}
