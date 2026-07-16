import type { Product } from '@/types/catalog'
import type { SearchCriteria } from '@/features/catalog/lib/search-params'
import { getColorOptions, isInStock } from '@/features/catalog/lib/facets'
import { resolveDisplayPrice } from '@/lib/money'

const NGN_MINOR_PER_MAJOR = 100

function authoredNgnMinor(product: Product): number {
  return resolveDisplayPrice(product.priceSet, 'NGN', {}).amountMinor
}

/** Lowercased haystack of every field the free-text query searches. */
function searchHaystack(product: Product): string {
  return [
    product.name,
    product.shortDescription,
    product.material,
    ...product.materialTags,
    ...getColorOptions(product),
    product.categorySlug,
    product.subcategorySlug ?? '',
  ].join(' ').toLowerCase()
}

function matchesQuery(product: Product, query: string): boolean {
  const haystack = searchHaystack(product)
  return query.toLowerCase().split(/\s+/).filter(Boolean).every((token) => haystack.includes(token))
}

/** Predicate for every criterion EXCEPT the ones named in `skip` (used by facet counts). */
function matches(product: Product, c: SearchCriteria, skip: Set<string> = new Set()): boolean {
  if (!skip.has('query') && c.query && !matchesQuery(product, c.query)) return false
  if (!skip.has('categories') && c.categories.length && !c.categories.includes(product.categorySlug)) return false
  if (!skip.has('subcategory') && c.subcategory && product.subcategorySlug !== c.subcategory) return false
  if (!skip.has('materials') && c.materials.length && !c.materials.some((m) => product.materialTags.includes(m))) return false
  if (!skip.has('colors') && c.colors.length) {
    const colors = getColorOptions(product)
    if (!c.colors.some((col) => colors.includes(col))) return false
  }
  if (!skip.has('badges') && c.badges.length && !c.badges.some((b) => (product.badges as string[]).includes(b))) return false
  if (!skip.has('price')) {
    const price = authoredNgnMinor(product)
    if (c.priceMin !== undefined && price < Math.round(c.priceMin * NGN_MINOR_PER_MAJOR)) return false
    if (c.priceMax !== undefined && price > Math.round(c.priceMax * NGN_MINOR_PER_MAJOR)) return false
  }
  if (!skip.has('inStock') && c.inStock && !isInStock(product)) return false
  return true
}

export function searchAndFilterProducts(products: Product[], criteria: SearchCriteria): Product[] {
  const result = products.filter((p) => matches(p, criteria))
  if (criteria.sort === 'price-asc') result.sort((a, b) => authoredNgnMinor(a) - authoredNgnMinor(b))
  else if (criteria.sort === 'price-desc') result.sort((a, b) => authoredNgnMinor(b) - authoredNgnMinor(a))
  // 'newest' preserves input order.
  return result
}

export interface FacetCounts {
  categories: Record<string, number>
  materials: Record<string, number>
  colors: Record<string, number>
  badges: Record<string, number>
}

function tally(products: Product[], c: SearchCriteria, skip: string, valuesOf: (p: Product) => string[]): Record<string, number> {
  const counts: Record<string, number> = {}
  const eligible = products.filter((p) => matches(p, c, new Set([skip])))
  for (const p of eligible) for (const v of valuesOf(p)) counts[v] = (counts[v] ?? 0) + 1
  return counts
}

export function computeFacetCounts(products: Product[], criteria: SearchCriteria): FacetCounts {
  return {
    categories: tally(products, criteria, 'categories', (p) => [p.categorySlug]),
    materials: tally(products, criteria, 'materials', (p) => p.materialTags),
    colors: tally(products, criteria, 'colors', getColorOptions),
    badges: tally(products, criteria, 'badges', (p) => p.badges as string[]),
  }
}
