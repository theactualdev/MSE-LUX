'use server'
import type { Product } from '@/types/catalog'
import { db } from '@/lib/db'
import { PRODUCT_INCLUDE } from './load-catalog'
import { toDomainProduct } from './mapper'

/**
 * Resolves product ids to domain products, preserving the requested order and
 * dropping ids that no longer resolve (deleted, or no longer `ACTIVE`). Used by
 * the guest cart/wishlist and the recently-viewed shelf so they no longer
 * import the bundled mock catalog.
 *
 * Queries **only the requested ids** (`WHERE id IN (…)`), not the whole
 * catalog. An earlier version resolved through `loadCatalog()`, which reads
 * every ACTIVE product with its full relation graph — ~800ms per call. Because
 * the cart/wishlist hooks call this on the client (once per mounted consumer,
 * on every change), several of those full-catalog reads ran concurrently and
 * starved the connection pool, which in turn stalled the interactive
 * transactions in `cart/data.ts`/`wishlist/data.ts` (surfacing as `P2028`
 * "unable to start a transaction") and left the wishlist page stuck on
 * skeletons. A targeted lookup is a small indexed query instead.
 */
export async function resolveProductsByIds(ids: string[]): Promise<Product[]> {
  if (ids.length === 0) return []

  const uniqueIds = Array.from(new Set(ids))
  const rows = await db.product.findMany({
    where: { id: { in: uniqueIds }, status: 'ACTIVE' },
    include: PRODUCT_INCLUDE,
  })

  // Index by id, then walk the *requested* order — preserving caller order and
  // naturally dropping ids the query didn't return (unknown / non-ACTIVE).
  const byId = new Map(rows.map((row) => [row.id, toDomainProduct(row)]))
  const out: Product[] = []
  for (const id of ids) {
    const product = byId.get(id)
    if (product) out.push(product)
  }
  return out
}
