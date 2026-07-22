import 'server-only'

// Async, DB-backed mirrors of `src/features/catalog/lib/selectors.ts` (the mock-data selectors
// the catalog pages currently render). The bodies below deliberately duplicate that file's
// filtering/sorting semantics rather than sharing code with it: `lib/selectors.ts` operates on
// the synchronous in-memory mock catalog and is retired in Phase 5c once every page reads from
// here instead, and until then Task 5's parity test pins each sync/async pair equal so the two
// can never silently drift. Do not "DRY" the two files together before that retirement.
//
// `getProductById` and `getFeaturedProducts` are intentionally not mirrored here — no in-scope
// page (Tasks 6-7) calls them, so mirroring them now would be speculative (YAGNI).

import type { Category, Collection, Product, Subcategory } from '@/types/catalog'
import { loadCatalog } from './load-catalog'

// --- Products ---

export async function getAllProducts(): Promise<Product[]> {
  const { products } = await loadCatalog()
  // `loadCatalog`'s query already restricts to `status: 'ACTIVE'`; this filter is a second,
  // defence-in-depth gate that also keeps this function's semantics identical to the sync
  // `getAllProducts`, which filters the (draft-inclusive) mock array the same way.
  return products.filter((p) => p.status === 'active')
}

export async function getProductBySlug(slug: string): Promise<Product | undefined> {
  const products = await getAllProducts()
  return products.find((p) => p.slug === slug)
}

export async function getProductsByCategory(categorySlug: string): Promise<Product[]> {
  const products = await getAllProducts()
  return products.filter((p) => p.categorySlug === categorySlug)
}

export async function getProductsBySubcategory(categorySlug: string, subcategorySlug: string): Promise<Product[]> {
  const products = await getAllProducts()
  return products.filter((p) => p.categorySlug === categorySlug && p.subcategorySlug === subcategorySlug)
}

export async function getBestSellers(): Promise<Product[]> {
  const products = await getAllProducts()
  return products.filter((p) => p.badges.includes('best-seller'))
}

export async function getNewArrivals(): Promise<Product[]> {
  const products = await getAllProducts()
  return products.filter((p) => p.badges.includes('new'))
}

/**
 * Same category first, falling back to a shared collection, excluding the
 * source product itself, sliced to `limit`.
 */
export async function getRelatedProducts(product: Product, limit: number): Promise<Product[]> {
  const all = await getAllProducts()
  const pool = all.filter((p) => p.id !== product.id)

  const sameCategory = pool.filter((p) => p.categorySlug === product.categorySlug)
  if (sameCategory.length >= limit) return sameCategory.slice(0, limit)

  const sharedCollection = pool.filter(
    (p) => !sameCategory.includes(p) && p.collectionSlugs.some((slug) => product.collectionSlugs.includes(slug)),
  )

  return [...sameCategory, ...sharedCollection].slice(0, limit)
}

// --- Categories ---

export async function getAllCategories(): Promise<Category[]> {
  const { categories } = await loadCatalog()
  return categories
}

export async function getCategoryBySlug(slug: string): Promise<Category | undefined> {
  const categories = await getAllCategories()
  return categories.find((c) => c.slug === slug)
}

export async function getSubcategory(categorySlug: string, subcategorySlug: string): Promise<Subcategory | undefined> {
  const category = await getCategoryBySlug(categorySlug)
  return category?.subcategories.find((s) => s.slug === subcategorySlug)
}

// --- Collections ---

export async function getAllCollections(): Promise<Collection[]> {
  const { collections } = await loadCatalog()
  return collections
}

export async function getCollectionBySlug(slug: string): Promise<Collection | undefined> {
  const collections = await getAllCollections()
  return collections.find((c) => c.slug === slug)
}

export async function getProductsInCollection(slug: string): Promise<Product[]> {
  const products = await getAllProducts()
  return products.filter((p) => p.collectionSlugs.includes(slug))
}
