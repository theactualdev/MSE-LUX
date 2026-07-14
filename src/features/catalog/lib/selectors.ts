import type { Category, Collection, Product, Subcategory } from '@/types/catalog'
import { categories } from '@/features/catalog/data/categories'
import { collections } from '@/features/catalog/data/collections'
import { products } from '@/features/catalog/data/products'

/** Number of best-sellers used to backfill `getFeaturedProducts` when no collection is flagged featured. */
const FEATURED_FALLBACK_COUNT = 8
/** Collections treated as "featured" on the home page. */
const FEATURED_COLLECTION_SLUGS = ['bridal', 'statement']

// --- Products ---

export function getAllProducts(): Product[] {
  return products.filter((p) => p.status === 'active')
}

export function getProductBySlug(slug: string): Product | undefined {
  return getAllProducts().find((p) => p.slug === slug)
}

export function getProductById(id: string): Product | undefined {
  return getAllProducts().find((p) => p.id === id)
}

export function getProductsByCategory(categorySlug: string): Product[] {
  return getAllProducts().filter((p) => p.categorySlug === categorySlug)
}

export function getProductsBySubcategory(categorySlug: string, subcategorySlug: string): Product[] {
  return getAllProducts().filter(
    (p) => p.categorySlug === categorySlug && p.subcategorySlug === subcategorySlug,
  )
}

export function getBestSellers(): Product[] {
  return getAllProducts().filter((p) => p.badges.includes('best-seller'))
}

export function getNewArrivals(): Product[] {
  return getAllProducts().filter((p) => p.badges.includes('new'))
}

/**
 * Deterministic rule: products belonging to a "featured" collection, deduped,
 * falling back to the first N best-sellers (by data order) if that set is empty.
 */
export function getFeaturedProducts(): Product[] {
  const fromFeaturedCollections = getAllProducts().filter((p) =>
    p.collectionSlugs.some((slug) => FEATURED_COLLECTION_SLUGS.includes(slug)),
  )
  if (fromFeaturedCollections.length > 0) return fromFeaturedCollections
  return getBestSellers().slice(0, FEATURED_FALLBACK_COUNT)
}

/**
 * Same category first, falling back to a shared collection, excluding the
 * source product itself, sliced to `limit`.
 */
export function getRelatedProducts(product: Product, limit: number): Product[] {
  const pool = getAllProducts().filter((p) => p.id !== product.id)

  const sameCategory = pool.filter((p) => p.categorySlug === product.categorySlug)
  if (sameCategory.length >= limit) return sameCategory.slice(0, limit)

  const sharedCollection = pool.filter(
    (p) => !sameCategory.includes(p) && p.collectionSlugs.some((slug) => product.collectionSlugs.includes(slug)),
  )

  return [...sameCategory, ...sharedCollection].slice(0, limit)
}

// --- Categories ---

export function getAllCategories(): Category[] {
  return categories
}

export function getCategoryBySlug(slug: string): Category | undefined {
  return categories.find((c) => c.slug === slug)
}

export function getSubcategory(categorySlug: string, subcategorySlug: string): Subcategory | undefined {
  return getCategoryBySlug(categorySlug)?.subcategories.find((s) => s.slug === subcategorySlug)
}

// --- Collections ---

export function getAllCollections(): Collection[] {
  return collections
}

export function getCollectionBySlug(slug: string): Collection | undefined {
  return collections.find((c) => c.slug === slug)
}

export function getProductsInCollection(slug: string): Product[] {
  return getAllProducts().filter((p) => p.collectionSlugs.includes(slug))
}
