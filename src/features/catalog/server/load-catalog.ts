import 'server-only'

import { cache } from 'react'
import { db } from '@/lib/db'
import type { Category, Collection, Product } from '@/types/catalog'
import { bySuppliedOrder, toDomainCategory, toDomainCollection, toDomainProduct } from './mapper'

// Authored taxonomy order. Category/Subcategory/Collection have no `position` (or `createdAt`)
// column — only Product does — and cuid primary keys are not sortable into authoring order, so
// until Phase 8's admin adds a real `position` column, the authored order is pinned here as a
// literal copy of the file order in `src/features/catalog/data/{categories,collections}.ts`.
// Task 5's parity check (which pins the sync `lib/selectors.ts` output equal to these async
// selectors) fails loudly on any drift between this list and those data files.
const CATEGORY_ORDER = ['jewelry', 'beads', 'accessories'] as const
const SUBCATEGORY_ORDER = [
  'necklaces',
  'bracelets',
  'earrings',
  'anklets',
  'rings',
  'loose-beads',
  'bead-strands',
  'waist-beads',
  'bags',
  'hair',
  'other',
] as const
const COLLECTION_ORDER = ['bridal', 'everyday', 'statement'] as const

export interface CatalogSnapshot {
  products: Product[]
  categories: Category[]
  collections: Collection[]
}

/**
 * One catalog read per request, via React's `cache()` (per-request dedup for non-`fetch` data
 * sources — see `node_modules/next/dist/docs/01-app/02-guides/caching-without-cache-components.md`,
 * "Deduplicating requests"). ACTIVE-only: Prisma connects through the pooler as a privileged role
 * and bypasses RLS entirely, so the `where: { status: 'ACTIVE' }` below is the *only* gate that
 * keeps DRAFT products out of the storefront — there is no database-level policy backing it up.
 */
export const loadCatalog = cache(async (): Promise<CatalogSnapshot> => {
  const [productRows, categoryRows, collectionRows] = await Promise.all([
    db.product.findMany({
      where: { status: 'ACTIVE' },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      include: {
        category: { select: { slug: true } },
        subcategory: { select: { slug: true } },
        images: { orderBy: { position: 'asc' } },
        optionTypes: { orderBy: { position: 'asc' }, include: { values: { orderBy: { position: 'asc' } } } },
        variants: { orderBy: { id: 'asc' }, include: { options: true } },
        collections: { orderBy: { position: 'asc' }, include: { collection: { select: { slug: true } } } },
      },
    }),
    db.category.findMany({ include: { subcategories: true } }),
    db.collection.findMany({
      include: { products: { orderBy: { position: 'asc' }, include: { product: { select: { slug: true } } } } },
    }),
  ])

  return {
    products: productRows.map(toDomainProduct),
    categories: [...categoryRows]
      .sort(bySuppliedOrder(CATEGORY_ORDER, (c) => c.slug))
      .map((row) => toDomainCategory(row, SUBCATEGORY_ORDER)),
    collections: [...collectionRows]
      .sort(bySuppliedOrder(COLLECTION_ORDER, (c) => c.slug))
      .map(toDomainCollection),
  }
})
