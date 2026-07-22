import 'server-only'

// Pure, DB-free mapping helpers from Prisma catalog rows (`prisma/schema.prisma`) to the
// domain `Product`/`Category`/`Collection` types the components already render
// (`src/types/catalog.ts`). This is the inverse of `prisma/seed-mappers.ts` — where that file
// maps mock objects to Prisma create-input shapes, this file maps Prisma query results back.
//
// Money is always read as integer minor units in both authored currencies (NGN/USD); these
// mappers never derive one currency from the other and never introduce a Float.
//
// The row types below are deliberately narrow, local mirrors of the generated Prisma payload
// shapes (see `src/generated/prisma/models/*.ts`) rather than the generated types themselves —
// same technique and same reason `seed-mappers.ts` documents at its head: the generated
// `GetPayload`/include types are unwieldy to construct/assert against directly. Each shape here
// is a structural subset that a Prisma query's `select`/`include` result satisfies, so the
// cached loader (Task 4) can pass its query results straight into these functions.

import type { Badge, ProductStatus } from '@/generated/prisma/enums'
import type { Category, Collection, Product, ProductVariant as CatalogVariant, Subcategory } from '@/types/catalog'
import type { PriceSet } from '@/types/money'

export interface ProductImageRowForMapping {
  src: string
  alt: string
  position: number
}

export interface ProductOptionValueRowForMapping {
  value: string
  position: number
}

export interface ProductOptionTypeRowForMapping {
  name: string
  position: number
  values: ProductOptionValueRowForMapping[]
}

export interface VariantOptionRowForMapping {
  name: string
  value: string
}

export interface ProductVariantRowForMapping {
  id: string
  sku: string
  inventory: number
  priceNgnMinor: number | null
  priceUsdMinor: number | null
  image: string | null
  options: VariantOptionRowForMapping[]
}

export interface ProductCollectionRowForMapping {
  /** `ProductCollection.position` is nullable in the schema; nulls sort last. */
  position: number | null
  collection: { slug: string }
}

/** Structural mirror of the Prisma `Product` query shape the cached loader (Task 4) selects. */
export interface ProductRowForMapping {
  id: string
  slug: string
  sku: string
  name: string
  shortDescription: string
  description: string
  material: string
  materialTags: string[]
  badges: Badge[]
  status: ProductStatus
  priceNgnMinor: number
  priceUsdMinor: number
  salePriceNgnMinor: number | null
  salePriceUsdMinor: number | null
  inventory: number
  seoTitle: string | null
  seoDescription: string | null
  category: { slug: string }
  subcategory: { slug: string } | null
  images: ProductImageRowForMapping[]
  optionTypes: ProductOptionTypeRowForMapping[]
  variants: ProductVariantRowForMapping[]
  collections: ProductCollectionRowForMapping[]
}

export interface SubcategoryRowForMapping {
  slug: string
  name: string
}

/** Structural mirror of the Prisma `Category` query shape, including its `subcategories` relation. */
export interface CategoryRowForMapping {
  slug: string
  name: string
  description: string | null
  image: string | null
  subcategories: SubcategoryRowForMapping[]
}

export interface CollectionProductRowForMapping {
  /** `ProductCollection.position` is nullable in the schema; nulls sort last. */
  position: number | null
  product: { slug: string }
}

/** Structural mirror of the Prisma `Collection` query shape, including its `products` join relation. */
export interface CollectionRowForMapping {
  slug: string
  name: string
  description: string | null
  image: string | null
  products: CollectionProductRowForMapping[]
}

/** Maps the Prisma `Badge` enum back to the catalog's string-literal badges. */
const BADGE_BY_DB: Record<Badge, Product['badges'][number]> = {
  NEW: 'new',
  BEST_SELLER: 'best-seller',
}

function toPriceSet(ngnMinor: number, usdMinor: number): PriceSet {
  return { ngn: { amountMinor: ngnMinor, currency: 'NGN' }, usd: { amountMinor: usdMinor, currency: 'USD' } }
}

/** Both authored currencies or nothing — a one-sided sale/override row is authoring debris, never rendered. */
function toOptionalPriceSet(ngnMinor: number | null, usdMinor: number | null): PriceSet | undefined {
  return ngnMinor !== null && usdMinor !== null ? toPriceSet(ngnMinor, usdMinor) : undefined
}

function byPosition<T extends { position: number }>(a: T, b: T): number {
  return a.position - b.position
}

/** Nullable positions (join-table rows) sort last, stably, among themselves. */
function byNullablePosition<T extends { position: number | null }>(a: T, b: T): number {
  const aPos = a.position ?? Number.POSITIVE_INFINITY
  const bPos = b.position ?? Number.POSITIVE_INFINITY
  return aPos - bPos
}

/**
 * Sorts by index in a caller-supplied order list (e.g. authored slug/name order). An entry whose
 * key isn't in `order` — drift between the row and the order list — sorts last, stably, rather
 * than first: `indexOf` returns `-1` for "not found", which would otherwise sort before every
 * real index (0, 1, 2, ...), so `-1` is remapped to `+Infinity` here.
 */
function bySuppliedOrder<T>(order: readonly string[], keyOf: (item: T) => string): (a: T, b: T) => number {
  const rank = (item: T): number => {
    const index = order.indexOf(keyOf(item))
    return index === -1 ? Number.POSITIVE_INFINITY : index
  }
  return (a, b) => rank(a) - rank(b)
}

/**
 * `VariantOption` rows carry no position column, so a variant's options are re-ordered to match
 * the product's authored `optionTypes` name order (the source of truth for option ordering).
 */
function toDomainVariant(row: ProductVariantRowForMapping, optionTypeNameOrder: readonly string[]): CatalogVariant {
  const orderedOptions = [...row.options].sort(bySuppliedOrder(optionTypeNameOrder, (option) => option.name))

  return {
    id: row.id,
    sku: row.sku,
    options: orderedOptions.map(({ name, value }) => ({ name, value })),
    priceSet: toOptionalPriceSet(row.priceNgnMinor, row.priceUsdMinor),
    inventory: row.inventory,
    image: row.image ?? undefined,
  }
}

/**
 * Maps a Prisma product row (with its relations included) to the domain `Product` the catalog
 * components render. Sorts `images`/`optionTypes`/`values`/`collections` by `position` itself —
 * correctness must not depend on the caller's query `orderBy`.
 */
export function toDomainProduct(row: ProductRowForMapping): Product {
  const sortedImages = [...row.images].sort(byPosition)
  const sortedOptionTypes = [...row.optionTypes].sort(byPosition)
  const optionTypeNameOrder = sortedOptionTypes.map((optionType) => optionType.name)
  const sortedCollections = [...row.collections].sort(byNullablePosition)

  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    shortDescription: row.shortDescription,
    description: row.description,
    priceSet: toPriceSet(row.priceNgnMinor, row.priceUsdMinor),
    salePriceSet: toOptionalPriceSet(row.salePriceNgnMinor, row.salePriceUsdMinor),
    sku: row.sku,
    inventory: row.inventory,
    material: row.material,
    materialTags: row.materialTags,
    categorySlug: row.category.slug,
    subcategorySlug: row.subcategory?.slug,
    collectionSlugs: sortedCollections.map((c) => c.collection.slug),
    images: sortedImages.map((image) => ({ src: image.src, alt: image.alt })),
    optionTypes: sortedOptionTypes.map((optionType) => ({
      name: optionType.name,
      values: [...optionType.values].sort(byPosition).map((value) => value.value),
    })),
    variants: row.variants.map((variant) => toDomainVariant(variant, optionTypeNameOrder)),
    badges: row.badges.map((badge) => BADGE_BY_DB[badge]),
    status: row.status === 'ACTIVE' ? 'active' : 'draft',
    seo: { title: row.seoTitle ?? undefined, description: row.seoDescription ?? undefined },
  }
}

/**
 * Maps a Prisma category row to the domain `Category`. `Subcategory` has no position column in
 * the schema, so the authored order must be supplied by the caller (`subcategoryOrder`, a list
 * of subcategory slugs) rather than derived from the row itself.
 */
export function toDomainCategory(row: CategoryRowForMapping, subcategoryOrder: readonly string[]): Category {
  const orderedSubcategories = [...row.subcategories].sort(bySuppliedOrder(subcategoryOrder, (s) => s.slug))

  return {
    slug: row.slug,
    name: row.name,
    description: row.description ?? undefined,
    image: row.image ?? undefined,
    subcategories: orderedSubcategories.map(
      (subcategory): Subcategory => ({
        slug: subcategory.slug,
        name: subcategory.name,
        categorySlug: row.slug,
      }),
    ),
  }
}

/** Maps a Prisma collection row (with its `products` join rows included) to the domain `Collection`. */
export function toDomainCollection(row: CollectionRowForMapping): Collection {
  const sortedProducts = [...row.products].sort(byNullablePosition)

  return {
    slug: row.slug,
    name: row.name,
    description: row.description ?? undefined,
    image: row.image ?? undefined,
    productSlugs: sortedProducts.map((p) => p.product.slug),
  }
}
