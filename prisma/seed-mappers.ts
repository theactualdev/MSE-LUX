// Pure, DB-free mapping helpers from Phase 2 mock catalog objects (`src/types/catalog.ts`)
// to Prisma "create input" shapes (`prisma/schema.prisma`). No PrismaClient import here —
// these functions only build plain objects; `prisma/seed.ts` is what actually talks to the DB.
//
// Money is always integer minor units in both authored currencies (NGN/USD); these mappers
// never derive one currency from the other and never introduce a Float/Decimal.
//
// The return types below are deliberately narrow, local mirrors of the generated Prisma
// "UncheckedCreateInput" shapes (see `src/generated/prisma/models/*.ts`) rather than the
// generated types themselves — the generated nested-create types are XOR unions that are
// awkward to construct/assert against directly. Each shape here is a structural subset that
// Prisma's client accepts, so `prisma/seed.ts` can pass these straight into `upsert()`.

import type { Badge, ProductStatus } from '@/generated/prisma/enums'
import type { OptionValue, Product, ProductVariant as CatalogVariant } from '@/types/catalog'

export interface VariantOptionCreateRow {
  name: string
  value: string
}

export interface ProductImageCreateRow {
  src: string
  alt: string
  position: number
}

export interface ProductOptionValueCreateRow {
  value: string
  position: number
}

export interface ProductOptionTypeCreateRow {
  name: string
  position: number
  values: { create: ProductOptionValueCreateRow[] }
}

export interface ProductVariantCreateRow {
  id: string
  sku: string
  inventory: number
  priceNgnMinor: number | null
  priceUsdMinor: number | null
  image: string | null
  options: { create: VariantOptionCreateRow[] }
}

export interface ProductCreateRow {
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
  categoryId: string
  subcategoryId: string | null
  images: { create: ProductImageCreateRow[] }
  variants: { create: ProductVariantCreateRow[] }
  optionTypes: { create: ProductOptionTypeCreateRow[] }
}

/** Maps the catalog's string-literal badges to the Prisma `Badge` enum. */
const BADGE_BY_CATALOG_VALUE: Record<Product['badges'][number], Badge> = {
  new: 'NEW',
  'best-seller': 'BEST_SELLER',
}

export function toBadges(badges: Product['badges']): Badge[] {
  return badges.map((badge) => BADGE_BY_CATALOG_VALUE[badge])
}

/** Flattens a variant's `options` array to one `VariantOption` create row per entry. */
export function toVariantOptionCreate(options: OptionValue[]): VariantOptionCreateRow[] {
  return options.map(({ name, value }) => ({ name, value }))
}

/** A variant's own `priceSet` is an optional override; absent means "inherit the product's price". */
export function toVariantCreate(variant: CatalogVariant): ProductVariantCreateRow {
  return {
    id: variant.id,
    sku: variant.sku,
    inventory: variant.inventory,
    priceNgnMinor: variant.priceSet?.ngn.amountMinor ?? null,
    priceUsdMinor: variant.priceSet?.usd.amountMinor ?? null,
    image: variant.image ?? null,
    options: { create: toVariantOptionCreate(variant.options) },
  }
}

/** `position` is deterministic: the image's index in the authored `images` array. */
export function toImageCreate(image: { src: string; alt: string }, index: number): ProductImageCreateRow {
  return { src: image.src, alt: image.alt, position: index }
}

/**
 * Maps a product's authored `optionTypes` (e.g. Size: S|M|L|XL) to ordered
 * `ProductOptionType` + `ProductOptionValue` create rows. `position` on both levels
 * preserves the authored array order — it must never be derived by sorting/alphabetising.
 */
export function toOptionTypesCreate(optionTypes: Product['optionTypes']): ProductOptionTypeCreateRow[] {
  return optionTypes.map((optionType, typeIndex) => ({
    name: optionType.name,
    position: typeIndex,
    values: {
      create: optionType.values.map(
        (value, valueIndex): ProductOptionValueCreateRow => ({
          value,
          position: valueIndex,
        }),
      ),
    },
  }))
}

/**
 * Maps a Phase 2 mock `Product` to a Prisma product create input, resolving its
 * category/subcategory FKs from lookup maps built by the caller (`prisma/seed.ts`) from the
 * already-upserted Category/Subcategory rows.
 *
 * `subcategoryIdByKey` is keyed on `${categorySlug}:${subcategorySlug}` — composite because
 * `Subcategory.slug` is only unique per-category (`@@unique([categoryId, slug])`), not globally.
 */
export function toProductCreate(
  product: Product,
  categoryIdBySlug: Record<string, string>,
  subcategoryIdByKey: Record<string, string>,
): ProductCreateRow {
  const categoryId = categoryIdBySlug[product.categorySlug]
  if (!categoryId) {
    throw new Error(`toProductCreate: unknown category slug "${product.categorySlug}" for product "${product.slug}"`)
  }

  let subcategoryId: string | null = null
  if (product.subcategorySlug) {
    const key = `${product.categorySlug}:${product.subcategorySlug}`
    const resolved = subcategoryIdByKey[key]
    if (!resolved) {
      throw new Error(`toProductCreate: unknown subcategory "${key}" for product "${product.slug}"`)
    }
    subcategoryId = resolved
  }

  return {
    id: product.id,
    slug: product.slug,
    sku: product.sku,
    name: product.name,
    shortDescription: product.shortDescription,
    description: product.description,
    material: product.material,
    materialTags: product.materialTags,
    badges: toBadges(product.badges),
    status: product.status === 'active' ? 'ACTIVE' : 'DRAFT',
    priceNgnMinor: product.priceSet.ngn.amountMinor,
    priceUsdMinor: product.priceSet.usd.amountMinor,
    salePriceNgnMinor: product.salePriceSet?.ngn.amountMinor ?? null,
    salePriceUsdMinor: product.salePriceSet?.usd.amountMinor ?? null,
    inventory: product.inventory,
    seoTitle: product.seo.title ?? null,
    seoDescription: product.seo.description ?? null,
    categoryId,
    subcategoryId,
    images: { create: product.images.map((image, index) => toImageCreate(image, index)) },
    variants: { create: product.variants.map(toVariantCreate) },
    optionTypes: { create: toOptionTypesCreate(product.optionTypes) },
  }
}
