import 'server-only'
import type { Product } from '@/types/catalog'
import { loadCatalog } from './load-catalog'

/** Resolves product ids to domain products (Phase 5a DB catalog), preserving the requested
 *  order and dropping ids that no longer resolve. Used by the guest cart/wishlist and the
 *  recently-viewed shelf so they no longer import the bundled mock catalog. */
export async function resolveProductsByIds(ids: string[]): Promise<Product[]> {
  if (ids.length === 0) return []
  const { products } = await loadCatalog()
  const byId = new Map(products.map((p) => [p.id, p]))
  const out: Product[] = []
  for (const id of ids) {
    const p = byId.get(id)
    if (p) out.push(p)
  }
  return out
}
