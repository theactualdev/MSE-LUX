import type { Product } from '@/types/catalog'
import { searchAndFilterProducts } from '@/features/catalog/lib/search'

export type ListingSort = 'newest' | 'price-asc' | 'price-desc'

export interface ListingOptions {
  /** Defaults to 'newest', which preserves the input (data) order. */
  sort?: ListingSort
  /** Inclusive lower bound on the authored NGN price, in NGN major units (naira). */
  priceMin?: number
  /** Inclusive upper bound on the authored NGN price, in NGN major units (naira). */
  priceMax?: number
  /** Subcategory slug to filter to. */
  subcategory?: string
}

/**
 * Pure filter + sort over a product list, driven by listing-page controls
 * (sort, price range, subcategory). Price bounds are given in NGN major
 * units and compared against the admin-authored NGN price (never a
 * FX-converted display price), so filtering stays stable regardless of
 * viewer currency.
 */
export function filterAndSortProducts(products: Product[], opts: ListingOptions = {}): Product[] {
  return searchAndFilterProducts(products, {
    query: undefined, categories: [], subcategory: opts.subcategory, materials: [], colors: [],
    badges: [], priceMin: opts.priceMin, priceMax: opts.priceMax, inStock: false,
    sort: opts.sort ?? 'newest',
  })
}

const VALID_SORTS: ListingSort[] = ['newest', 'price-asc', 'price-desc']

/**
 * Parses a page's raw `searchParams` (all strings/undefined, per Next's
 * page prop) into `ListingOptions`, tolerating malformed or missing values
 * rather than letting them silently produce an empty/garbage result.
 */
export function parseListingParams(searchParams: Record<string, string | undefined>): ListingOptions {
  const sort = VALID_SORTS.find((candidate) => candidate === searchParams.sort)

  const priceMin = searchParams.priceMin ? Number(searchParams.priceMin) : NaN
  const priceMax = searchParams.priceMax ? Number(searchParams.priceMax) : NaN

  return {
    sort,
    priceMin: Number.isFinite(priceMin) ? priceMin : undefined,
    priceMax: Number.isFinite(priceMax) ? priceMax : undefined,
    subcategory: searchParams.subcategory || undefined,
  }
}
