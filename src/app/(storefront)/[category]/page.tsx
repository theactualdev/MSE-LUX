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
import { getAllCategories, getCategoryBySlug, getProductsByCategory } from '@/features/catalog/server/selectors'
import { parseSearchCriteria } from '@/features/catalog/lib/search-params'
import { computeFacetCounts, searchAndFilterProducts } from '@/features/catalog/lib/search'
import { allColors, allMaterialTags } from '@/features/catalog/lib/facets'
import { breadcrumbJsonLd, pageCards } from '@/lib/seo'

interface CategoryPageProps {
  params: Promise<{ category: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export async function generateStaticParams() {
  return (await getAllCategories()).map((category) => ({ category: category.slug }))
}

export async function generateMetadata({ params }: CategoryPageProps): Promise<Metadata> {
  const { category: categorySlug } = await params
  const category = await getCategoryBySlug(categorySlug)
  if (!category) return {}

  const title = category.name
  const description = category.description ?? `Shop ${category.name} at MSE Lux.`
  // A category's `image` is optional; `pageCards` omits `images` entirely
  // rather than falling back to a nonexistent `/og-default.png` (see its
  // comment for why).

  return {
    title,
    description,
    // The bare path only — this page also takes filter/sort `searchParams`,
    // which must never be folded into the canonical (it would fragment
    // canonicals across facet combinations and, since `generateMetadata`
    // doesn't receive `searchParams` here, force the route dynamic to read them).
    alternates: { canonical: `/${categorySlug}` },
    ...pageCards({ title, description, path: `/${categorySlug}`, image: category.image }),
  }
}

export default async function CategoryPage({ params, searchParams }: CategoryPageProps) {
  const { category: categorySlug } = await params
  const sp = await searchParams

  const category = await getCategoryBySlug(categorySlug)
  if (!category) notFound()

  const criteria = { ...parseSearchCriteria(sp), categories: [category.slug] }
  const scoped = await getProductsByCategory(category.slug)
  const products = searchAndFilterProducts(scoped, criteria)
  const counts = computeFacetCounts(scoped, criteria)

  const vocab: FacetVocab = {
    materials: allMaterialTags(scoped),
    colors: allColors(scoped),
    subcategories: category.subcategories.map((sub) => ({ slug: sub.slug, name: sub.name })),
  }

  const breadcrumbTrail = [
    { name: 'Home', path: '/' },
    { name: category.name, path: `/${category.slug}` },
  ]

  return (
    <Container className="flex flex-col gap-8 py-12 sm:py-16">
      <JsonLd data={breadcrumbJsonLd(breadcrumbTrail)} />

      <SectionHeading title={category.name} subtitle={category.description} as="h1" />
      <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
        {products.length} item{products.length === 1 ? '' : 's'}
      </p>

      <Suspense fallback={null}>
        <FilterDrawer resultCount={products.length}>
          <FacetPanel criteria={criteria} counts={counts} vocab={vocab} show={{ category: false, subcategory: true }} />
        </FilterDrawer>
      </Suspense>

      <div className="grid gap-8 lg:grid-cols-[16rem_1fr]">
        <Suspense fallback={null}>
          <FacetPanel
            criteria={criteria}
            counts={counts}
            vocab={vocab}
            show={{ category: false, subcategory: true }}
            className="hidden lg:flex"
          />
        </Suspense>

        <div className="flex flex-col gap-6">
          <Suspense fallback={null}>
            <ActiveFilterChips
              criteria={criteria}
              counts={counts}
              vocab={vocab}
              show={{ category: false, subcategory: true }}
            />
          </Suspense>

          <ProductGrid products={products} />
        </div>
      </div>
    </Container>
  )
}
