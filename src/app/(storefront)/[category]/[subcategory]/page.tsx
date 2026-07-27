import { Suspense } from 'react'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Container } from '@/components/brand/container'
import { SectionHeading } from '@/components/brand/section-heading'
import { JsonLd } from '@/components/seo/json-ld'
import { ProductGrid } from '@/features/catalog/components/product-grid'
import { FacetPanel, type FacetVocab } from '@/features/catalog/components/facet-panel'
import { ActiveFilterChips } from '@/features/catalog/components/active-filter-chips'
import { FilterDrawer } from '@/features/catalog/components/filter-drawer'
import {
  getAllCategories,
  getCategoryBySlug,
  getProductsBySubcategory,
  getSubcategory,
} from '@/features/catalog/server/selectors'
import { parseSearchCriteria } from '@/features/catalog/lib/search-params'
import { computeFacetCounts, searchAndFilterProducts } from '@/features/catalog/lib/search'
import { allColors, allMaterialTags } from '@/features/catalog/lib/facets'
import { absoluteUrl, breadcrumbJsonLd } from '@/lib/seo'

interface SubcategoryPageProps {
  params: Promise<{ category: string; subcategory: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export async function generateStaticParams() {
  return (await getAllCategories()).flatMap((category) =>
    category.subcategories.map((sub) => ({ category: category.slug, subcategory: sub.slug })),
  )
}

export async function generateMetadata({ params }: SubcategoryPageProps): Promise<Metadata> {
  const { category: categorySlug, subcategory: subcategorySlug } = await params
  const subcategory = await getSubcategory(categorySlug, subcategorySlug)
  if (!subcategory) return {}

  const category = await getCategoryBySlug(categorySlug)
  const title = `${subcategory.name} · ${category?.name ?? ''}`.trim()
  const description = `Shop ${subcategory.name} at MSE Lux.`
  const url = absoluteUrl(`/${categorySlug}/${subcategorySlug}`)

  return {
    title,
    description,
    // The bare path only — see the category page's canonical comment: this
    // page also takes filter/sort `searchParams` that must never be folded in.
    alternates: { canonical: `/${categorySlug}/${subcategorySlug}` },
    openGraph: {
      type: 'website',
      title,
      description,
      url,
      // Subcategory has no `image` field (unlike Category/Collection), so
      // there's never a hero to include here. No `/og-default.png` fallback
      // either — see the storefront layout's comment on why that path is
      // deliberately unreferenced pre-launch.
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  }
}

export default async function SubcategoryPage({ params, searchParams }: SubcategoryPageProps) {
  const { category: categorySlug, subcategory: subcategorySlug } = await params
  const sp = await searchParams

  const category = await getCategoryBySlug(categorySlug)
  const subcategory = await getSubcategory(categorySlug, subcategorySlug)
  if (!category || !subcategory) notFound()

  const criteria = {
    ...parseSearchCriteria(sp),
    categories: [category.slug],
    subcategory: subcategory.slug,
  }
  const scoped = await getProductsBySubcategory(category.slug, subcategory.slug)
  const products = searchAndFilterProducts(scoped, criteria)
  const counts = computeFacetCounts(scoped, criteria)

  const vocab: FacetVocab = {
    materials: allMaterialTags(scoped),
    colors: allColors(scoped),
  }

  const breadcrumbTrail = [
    { name: 'Home', path: '/' },
    { name: category.name, path: `/${category.slug}` },
    { name: subcategory.name, path: `/${category.slug}/${subcategory.slug}` },
  ]

  return (
    <Container className="flex flex-col gap-8 py-12 sm:py-16">
      <JsonLd data={breadcrumbJsonLd(breadcrumbTrail)} />

      <SectionHeading title={subcategory.name} subtitle={`Part of ${category.name}`} as="h1" />
      <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
        {products.length} item{products.length === 1 ? '' : 's'}
      </p>

      <Suspense fallback={null}>
        <FilterDrawer resultCount={products.length}>
          <FacetPanel criteria={criteria} counts={counts} vocab={vocab} show={{ category: false, subcategory: false }} />
        </FilterDrawer>
      </Suspense>

      <div className="grid gap-8 lg:grid-cols-[16rem_1fr]">
        <Suspense fallback={null}>
          <FacetPanel
            criteria={criteria}
            counts={counts}
            vocab={vocab}
            show={{ category: false, subcategory: false }}
            className="hidden lg:flex"
          />
        </Suspense>

        <div className="flex flex-col gap-6">
          <Suspense fallback={null}>
            <ActiveFilterChips
              criteria={criteria}
              counts={counts}
              vocab={vocab}
              show={{ category: false, subcategory: false }}
            />
          </Suspense>

          <ProductGrid products={products} />
        </div>
      </div>
    </Container>
  )
}
