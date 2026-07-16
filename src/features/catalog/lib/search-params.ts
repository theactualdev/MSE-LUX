import type { ListingSort } from '@/features/catalog/lib/listing'
import { PRODUCT_BADGES, type ProductBadge } from '@/features/catalog/lib/facets'

export interface SearchCriteria {
  query?: string
  categories: string[]
  subcategory?: string
  materials: string[]
  colors: string[]
  badges: ProductBadge[]
  priceMin?: number
  priceMax?: number
  inStock: boolean
  sort: ListingSort
}

const VALID_SORTS: ListingSort[] = ['newest', 'price-asc', 'price-desc']

/** Normalize a possibly-repeated search param into a string array. */
function toArray(value: string | string[] | undefined): string[] {
  if (value === undefined) return []
  return (Array.isArray(value) ? value : [value]).filter((v) => v.length > 0)
}

function toNumber(value: string | string[] | undefined): number | undefined {
  const raw = Array.isArray(value) ? value[0] : value
  if (!raw) return undefined
  const n = Number(raw)
  return Number.isFinite(n) ? n : undefined
}

export function parseSearchCriteria(
  searchParams: Record<string, string | string[] | undefined>,
): SearchCriteria {
  const rawQuery = (Array.isArray(searchParams.q) ? searchParams.q[0] : searchParams.q)?.trim()
  const sort = VALID_SORTS.find((s) => s === searchParams.sort) ?? 'newest'
  const badges = toArray(searchParams.badge).filter(
    (b): b is ProductBadge => (PRODUCT_BADGES as readonly string[]).includes(b),
  )
  const subcategory = Array.isArray(searchParams.subcategory)
    ? searchParams.subcategory[0]
    : searchParams.subcategory

  return {
    query: rawQuery ? rawQuery : undefined,
    categories: toArray(searchParams.category),
    subcategory: subcategory || undefined,
    materials: toArray(searchParams.material),
    colors: toArray(searchParams.color),
    badges,
    priceMin: toNumber(searchParams.priceMin),
    priceMax: toNumber(searchParams.priceMax),
    inStock: searchParams.inStock === '1',
    sort,
  }
}

/** Pure add/remove used by the client facet panel when toggling a multi-select option. */
export function toggleParamValue(current: string[], value: string): string[] {
  return current.includes(value) ? current.filter((v) => v !== value) : [...current, value]
}
