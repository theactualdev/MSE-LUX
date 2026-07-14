import { Suspense } from 'react'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Container } from '@/components/brand/container'
import { SectionHeading } from '@/components/brand/section-heading'
import { ProductGrid } from '@/features/catalog/components/product-grid'
import { ListingControls } from '@/features/catalog/components/listing-controls'
import {
  getAllCategories,
  getCategoryBySlug,
  getProductsBySubcategory,
  getSubcategory,
} from '@/features/catalog/lib/selectors'
import { filterAndSortProducts, parseListingParams } from '@/features/catalog/lib/listing'

interface SubcategoryPageProps {
  params: Promise<{ category: string; subcategory: string }>
  searchParams: Promise<Record<string, string | undefined>>
}

export async function generateStaticParams() {
  return getAllCategories().flatMap((category) =>
    category.subcategories.map((sub) => ({ category: category.slug, subcategory: sub.slug })),
  )
}

export async function generateMetadata({ params }: SubcategoryPageProps): Promise<Metadata> {
  const { category: categorySlug, subcategory: subcategorySlug } = await params
  const subcategory = getSubcategory(categorySlug, subcategorySlug)
  if (!subcategory) return {}

  const category = getCategoryBySlug(categorySlug)
  return {
    title: `${subcategory.name} · ${category?.name ?? ''}`.trim(),
    description: `Shop ${subcategory.name} at MSE Lux.`,
  }
}

export default async function SubcategoryPage({ params, searchParams }: SubcategoryPageProps) {
  const { category: categorySlug, subcategory: subcategorySlug } = await params
  const sp = await searchParams

  const category = getCategoryBySlug(categorySlug)
  const subcategory = getSubcategory(categorySlug, subcategorySlug)
  if (!category || !subcategory) notFound()

  const products = filterAndSortProducts(
    getProductsBySubcategory(category.slug, subcategory.slug),
    parseListingParams(sp),
  )

  return (
    <Container className="flex flex-col gap-8 py-12 sm:py-16">
      <SectionHeading title={subcategory.name} subtitle={`Part of ${category.name}`} as="h1" />

      <Suspense fallback={null}>
        <ListingControls />
      </Suspense>

      <ProductGrid products={products} />
    </Container>
  )
}
