'use server'

import { getAllProducts } from '@/features/catalog/server/selectors'
import { searchAndFilterProducts } from '@/features/catalog/lib/search'
import { parseSearchCriteria } from '@/features/catalog/lib/search-params'
import { checkRateLimit } from '@/lib/rate-limit'
import type { PriceSet } from '@/types/money'

const MAX_RESULTS = 8
const MIN_QUERY_LENGTH = 2

export interface SearchOverlayResult {
  slug: string
  name: string
  priceSet: PriceSet
  salePriceSet?: PriceSet
  image: { src: string; alt: string }
}

/**
 * Server Action backing the header search overlay. Queries the real (DB-backed)
 * catalog through the exact same `getAllProducts` + `searchAndFilterProducts`
 * pair the `/search` page uses, so overlay results and full-page results agree
 * by construction rather than by two implementations staying in sync.
 *
 * Below `MIN_QUERY_LENGTH` this returns `[]` without touching the db/selector
 * at all (pinned behaviour — the header shouldn't query the catalog on every
 * keystroke of a one-letter query). Never throws: a failure here must never
 * break the header, so any error is logged and swallowed into `[]`.
 *
 * Rate-limited (`'search'` window) as the very first thing, before even the
 * length check — a limit hit returns `[]` exactly like any other
 * "no results" case, so the overlay needs no new handling.
 */
export async function searchCatalog(query: string): Promise<SearchOverlayResult[]> {
  if (!(await checkRateLimit('search'))) return []

  const trimmed = query.trim()
  if (trimmed.length < MIN_QUERY_LENGTH) return []

  try {
    const all = await getAllProducts()
    const criteria = parseSearchCriteria({ q: trimmed })
    const results = searchAndFilterProducts(all, criteria).slice(0, MAX_RESULTS)

    return results.map((product) => ({
      slug: product.slug,
      name: product.name,
      priceSet: product.priceSet,
      salePriceSet: product.salePriceSet,
      image: product.images[0] ?? { src: '', alt: '' },
    }))
  } catch (error) {
    console.error('searchCatalog failed', error)
    return []
  }
}
