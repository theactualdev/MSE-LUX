import { Suspense } from 'react'
import type { Metadata } from 'next'
import { Container } from '@/components/brand/container'
import { SectionHeading } from '@/components/brand/section-heading'
import { ProductGrid } from '@/features/catalog/components/product-grid'
import { FacetPanel, type FacetVocab } from '@/features/catalog/components/facet-panel'
import { ActiveFilterChips } from '@/features/catalog/components/active-filter-chips'
import { FilterDrawer } from '@/features/catalog/components/filter-drawer'
import { getAllCategories, getAllProducts } from '@/features/catalog/lib/selectors'
import { parseSearchCriteria } from '@/features/catalog/lib/search-params'
import { computeFacetCounts, searchAndFilterProducts } from '@/features/catalog/lib/search'
import { allColors, allMaterialTags } from '@/features/catalog/lib/facets'

export const metadata: Metadata = {
  title: 'Search',
}

interface SearchPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const sp = await searchParams

  const all = getAllProducts()
  const criteria = parseSearchCriteria(sp)
  const products = searchAndFilterProducts(all, criteria)
  const counts = computeFacetCounts(all, criteria)

  const vocab: FacetVocab = {
    materials: allMaterialTags(all),
    colors: allColors(all),
    categories: getAllCategories().map((c) => ({ slug: c.slug, name: c.name })),
  }

  const heading = criteria.query ? `Results for “${criteria.query}”` : 'All products'

  return (
    <Container className="flex flex-col gap-8 py-12 sm:py-16">
      <SectionHeading title={heading} as="h1" />
      <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
        {products.length} item{products.length === 1 ? '' : 's'}
      </p>

      <Suspense fallback={null}>
        <FilterDrawer resultCount={products.length}>
          <FacetPanel criteria={criteria} counts={counts} vocab={vocab} show={{ category: true, subcategory: false }} />
        </FilterDrawer>
      </Suspense>

      <div className="grid gap-8 lg:grid-cols-[16rem_1fr]">
        <Suspense fallback={null}>
          <FacetPanel
            criteria={criteria}
            counts={counts}
            vocab={vocab}
            show={{ category: true, subcategory: false }}
            className="hidden lg:flex"
          />
        </Suspense>

        <div className="flex flex-col gap-6">
          <Suspense fallback={null}>
            <ActiveFilterChips
              criteria={criteria}
              counts={counts}
              vocab={vocab}
              show={{ category: true, subcategory: false }}
            />
          </Suspense>

          <ProductGrid products={products} />
        </div>
      </div>
    </Container>
  )
}
