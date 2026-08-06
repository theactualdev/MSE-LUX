import 'server-only'
import { db } from '@/lib/db'
import { ProductStatus, type Badge } from '@/generated/prisma/client'
import { updateProductSchema, type UpdateProductInput } from './schema'
import { deleteProductImageObject } from './images'
import type { z } from 'zod'

/**
 * The admin catalog product engine: validated edits (`updateProduct`), a
 * guarded ACTIVE⇄DRAFT toggle (`archiveProduct`/`restoreProduct`), and a
 * guarded hard delete (`deleteProduct`) that refuses to run once any order
 * has referenced the product — and, once the delete transaction commits,
 * best-effort-cleans up that product's storage objects via
 * `deleteProductImageObject` (`./images.ts`), same post-commit idiom as
 * `./structure.ts`'s image-replace cleanup. `computeProductRevalidateTargets`
 * is pure — no I/O — so the revalidation path list can be unit tested
 * without mocking Prisma.
 *
 * Ungated by design — every caller reaches this through actions.ts, which
 * re-checks ADMIN (server actions are public endpoints; the (admin) layout
 * gate covers rendering only).
 *
 * CONCURRENCY: archive/restore are atomic guarded `updateMany`s whose
 * `where` carries the expected FROM status — the same idiom as the order
 * state machine's transitions (`src/features/admin/orders/transitions.ts`).
 * Whoever wins the write gets `count === 1`; anyone else — a race, the
 * product already sitting in that state, or an id that doesn't exist at
 * all — gets `count === 0` → `'conflict'` (there is no separate
 * `'not-found'` outcome for these two; a missing id can never match the
 * guard either, so it folds into the same `count === 0` branch).
 */

export type CatalogWriteError =
  | 'not-found'
  | 'invalid-input'
  | 'conflict-slug'
  | 'conflict-sku'
  | 'invalid-taxonomy'
  | 'has-orders'
  | 'variant-has-orders'
  // A category/subcategory still has products filed under it. Products carry a
  // REQUIRED categoryId, so Postgres would refuse the delete anyway; this is
  // the checked, explainable form of that refusal.
  | 'has-products'
  | 'conflict'
  | 'error'

export type CatalogWriteResult =
  | { ok: true; revalidate: string[] }
  | { ok: false; error: CatalogWriteError; issues?: z.core.$ZodIssue[] }

/** `[categorySlug]` alone, plus `[categorySlug]/[subcategorySlug]` when a subcategory is set. */
function categoryPathFragments(categorySlug: string, subcategorySlug: string | null): string[] {
  return subcategorySlug ? [categorySlug, `${categorySlug}/${subcategorySlug}`] : [categorySlug]
}

/**
 * Pure — no I/O. Builds the deduped list of storefront paths a product
 * write needs revalidated: the PDP (before slug, and after slug if it
 * changed), and — unless the change was stock-only — every category /
 * subcategory listing and collection page the product belongs to
 * (before ∪ after), `/collections`, and `/`.
 */
export function computeProductRevalidateTargets(input: {
  beforeSlug: string
  afterSlug: string
  categorySlugs: string[]
  collectionSlugs: string[]
  stockOnly: boolean
}): string[] {
  const targets = new Set<string>()
  targets.add(`/products/${input.beforeSlug}`)
  if (input.afterSlug !== input.beforeSlug) targets.add(`/products/${input.afterSlug}`)

  if (!input.stockOnly) {
    for (const slug of input.categorySlugs) targets.add(`/${slug}`)
    for (const slug of input.collectionSlugs) targets.add(`/collections/${slug}`)
    targets.add('/collections')
    targets.add('/')
  }

  return [...targets]
}

function arraysEqual(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index])
}

function setsEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false
  const setB = new Set(b)
  return a.every((value) => setB.has(value))
}

type ComparableCurrentProduct = {
  name: string
  slug: string
  sku: string
  shortDescription: string
  description: string
  material: string
  materialTags: string[]
  badges: Badge[]
  priceNgnMinor: number
  priceUsdMinor: number
  salePriceNgnMinor: number | null
  salePriceUsdMinor: number | null
  weightGrams: number | null
  status: ProductStatus
  seoTitle: string | null
  seoDescription: string | null
  categoryId: string
  subcategoryId: string | null
  variants: { id: string; sku: string; priceNgnMinor: number | null; priceUsdMinor: number | null }[]
  collectionIds: string[]
}

/**
 * Pure — no I/O. `true` iff the parsed input differs from the currently
 * stored row in `inventory` and/or one or more `variants[].inventory`
 * values ONLY — every other field (including variant sku/price) is
 * byte-for-byte identical. Drives whether `updateProduct` treats the write
 * as PDP-only for revalidation purposes.
 */
function isStockOnlyChange(input: UpdateProductInput, current: ComparableCurrentProduct): boolean {
  const nonInventoryFieldsEqual =
    input.name === current.name &&
    input.slug === current.slug &&
    input.sku === current.sku &&
    input.shortDescription === current.shortDescription &&
    input.description === current.description &&
    input.material === current.material &&
    arraysEqual(input.materialTags, current.materialTags) &&
    arraysEqual(input.badges, current.badges) &&
    input.priceNgnMinor === current.priceNgnMinor &&
    input.priceUsdMinor === current.priceUsdMinor &&
    input.salePriceNgnMinor === current.salePriceNgnMinor &&
    input.salePriceUsdMinor === current.salePriceUsdMinor &&
    input.weightGrams === current.weightGrams &&
    input.status === current.status &&
    input.seoTitle === current.seoTitle &&
    input.seoDescription === current.seoDescription &&
    input.categoryId === current.categoryId &&
    input.subcategoryId === current.subcategoryId &&
    setsEqual(input.collectionIds, current.collectionIds)

  if (!nonInventoryFieldsEqual) return false
  if (input.variants.length !== current.variants.length) return false

  const currentVariantsById = new Map(current.variants.map((variant) => [variant.id, variant]))
  for (const variant of input.variants) {
    const match = currentVariantsById.get(variant.id)
    if (!match) return false
    if (variant.sku !== match.sku) return false
    if (variant.priceNgnMinor !== match.priceNgnMinor) return false
    if (variant.priceUsdMinor !== match.priceUsdMinor) return false
  }
  return true
}

async function collectionSlugsFor(collectionIds: string[]): Promise<string[]> {
  if (collectionIds.length === 0) return []
  const rows = await db.collection.findMany({ where: { id: { in: collectionIds } }, select: { slug: true } })
  return rows.map((row) => row.slug)
}

const CURRENT_PRODUCT_SELECT = {
  name: true,
  slug: true,
  sku: true,
  shortDescription: true,
  description: true,
  material: true,
  materialTags: true,
  badges: true,
  priceNgnMinor: true,
  priceUsdMinor: true,
  salePriceNgnMinor: true,
  salePriceUsdMinor: true,
  weightGrams: true,
  status: true,
  seoTitle: true,
  seoDescription: true,
  categoryId: true,
  subcategoryId: true,
  category: { select: { slug: true } },
  subcategory: { select: { slug: true } },
  variants: { select: { id: true, sku: true, inventory: true, priceNgnMinor: true, priceUsdMinor: true } },
  collections: { select: { collectionId: true } },
} as const

export async function updateProduct(id: string, input: unknown): Promise<CatalogWriteResult> {
  const parsed = updateProductSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'invalid-input', issues: parsed.error.issues }
  const data = parsed.data

  try {
    const current = await db.product.findUnique({ where: { id }, select: CURRENT_PRODUCT_SELECT })
    if (!current) return { ok: false, error: 'not-found' }

    const slugConflict = await db.product.findFirst({ where: { slug: data.slug, NOT: { id } } })
    if (slugConflict) return { ok: false, error: 'conflict-slug' }

    const skuConflict = await db.product.findFirst({ where: { sku: data.sku, NOT: { id } } })
    if (skuConflict) return { ok: false, error: 'conflict-sku' }

    if (data.variants.length > 0) {
      const variantSkuConflict = await db.productVariant.findFirst({
        where: { sku: { in: data.variants.map((variant) => variant.sku) }, NOT: { productId: id } },
      })
      if (variantSkuConflict) return { ok: false, error: 'conflict-sku' }
    }

    let afterSubcategorySlug: string | null = null
    if (data.subcategoryId) {
      const subcategory = await db.subcategory.findUnique({ where: { id: data.subcategoryId } })
      if (!subcategory || subcategory.categoryId !== data.categoryId) return { ok: false, error: 'invalid-taxonomy' }
      afterSubcategorySlug = subcategory.slug
    }

    let afterCategorySlug = current.category.slug
    if (data.categoryId !== current.categoryId) {
      const afterCategory = await db.category.findUnique({ where: { id: data.categoryId }, select: { slug: true } })
      if (!afterCategory) return { ok: false, error: 'invalid-taxonomy' }
      afterCategorySlug = afterCategory.slug
    }

    const currentVariantIds = new Set(current.variants.map((variant) => variant.id))
    for (const variant of data.variants) {
      if (!currentVariantIds.has(variant.id)) return { ok: false, error: 'invalid-input' }
    }

    const stockOnly = isStockOnlyChange(data, {
      ...current,
      collectionIds: current.collections.map((c) => c.collectionId),
    })

    await db.$transaction(async (tx) => {
      await tx.product.update({
        where: { id },
        data: {
          name: data.name,
          slug: data.slug,
          sku: data.sku,
          shortDescription: data.shortDescription,
          description: data.description,
          material: data.material,
          materialTags: data.materialTags,
          badges: data.badges,
          priceNgnMinor: data.priceNgnMinor,
          priceUsdMinor: data.priceUsdMinor,
          salePriceNgnMinor: data.salePriceNgnMinor,
          salePriceUsdMinor: data.salePriceUsdMinor,
          inventory: data.inventory,
          weightGrams: data.weightGrams,
          status: data.status,
          seoTitle: data.seoTitle,
          seoDescription: data.seoDescription,
          categoryId: data.categoryId,
          subcategoryId: data.subcategoryId,
        },
      })

      for (const variant of data.variants) {
        await tx.productVariant.update({
          where: { id: variant.id },
          data: {
            sku: variant.sku,
            inventory: variant.inventory,
            priceNgnMinor: variant.priceNgnMinor,
            priceUsdMinor: variant.priceUsdMinor,
          },
        })
      }

      await tx.productCollection.deleteMany({
        where: { productId: id, collectionId: { notIn: data.collectionIds } },
      })
      if (data.collectionIds.length > 0) {
        await tx.productCollection.createMany({
          data: data.collectionIds.map((collectionId) => ({ productId: id, collectionId })),
          skipDuplicates: true,
        })
      }
    })

    const beforeCollectionIds = current.collections.map((c) => c.collectionId)
    const unionCollectionIds = [...new Set([...beforeCollectionIds, ...data.collectionIds])]

    const targets = computeProductRevalidateTargets({
      beforeSlug: current.slug,
      afterSlug: data.slug,
      categorySlugs: [
        ...categoryPathFragments(current.category.slug, current.subcategory?.slug ?? null),
        ...categoryPathFragments(afterCategorySlug, afterSubcategorySlug),
      ],
      collectionSlugs: await collectionSlugsFor(unionCollectionIds),
      stockOnly,
    })
    return { ok: true, revalidate: targets }
  } catch (error) {
    console.error('[updateProduct] unexpected error', error)
    return { ok: false, error: 'error' }
  }
}

const TARGETS_SELECT = {
  slug: true,
  category: { select: { slug: true } },
  subcategory: { select: { slug: true } },
  collections: { select: { collectionId: true } },
} as const

/** `TARGETS_SELECT` plus the image `src`s `deleteProduct` needs for its
 * post-commit storage cleanup — kept as its own constant rather than
 * widening `TARGETS_SELECT` itself, since `archiveProduct`/`restoreProduct`
 * have no use for image rows. */
const DELETE_PRODUCT_SELECT = {
  ...TARGETS_SELECT,
  images: { select: { src: true } },
} as const

async function fullRevalidateTargetsFor(row: {
  slug: string
  category: { slug: string }
  subcategory: { slug: string } | null
  collections: { collectionId: string }[]
}): Promise<string[]> {
  return computeProductRevalidateTargets({
    beforeSlug: row.slug,
    afterSlug: row.slug,
    categorySlugs: categoryPathFragments(row.category.slug, row.subcategory?.slug ?? null),
    collectionSlugs: await collectionSlugsFor(row.collections.map((c) => c.collectionId)),
    stockOnly: false,
  })
}

export async function archiveProduct(id: string): Promise<CatalogWriteResult> {
  try {
    const { count } = await db.product.updateMany({
      where: { id, status: ProductStatus.ACTIVE },
      data: { status: ProductStatus.DRAFT },
    })
    if (count === 0) return { ok: false, error: 'conflict' }

    const current = await db.product.findUnique({ where: { id }, select: TARGETS_SELECT })
    if (!current) return { ok: false, error: 'error' }

    return { ok: true, revalidate: await fullRevalidateTargetsFor(current) }
  } catch (error) {
    console.error('[archiveProduct] unexpected error', error)
    return { ok: false, error: 'error' }
  }
}

export async function restoreProduct(id: string): Promise<CatalogWriteResult> {
  try {
    const { count } = await db.product.updateMany({
      where: { id, status: ProductStatus.DRAFT },
      data: { status: ProductStatus.ACTIVE },
    })
    if (count === 0) return { ok: false, error: 'conflict' }

    const current = await db.product.findUnique({ where: { id }, select: TARGETS_SELECT })
    if (!current) return { ok: false, error: 'error' }

    return { ok: true, revalidate: await fullRevalidateTargetsFor(current) }
  } catch (error) {
    console.error('[restoreProduct] unexpected error', error)
    return { ok: false, error: 'error' }
  }
}

export async function deleteProduct(id: string): Promise<CatalogWriteResult> {
  try {
    const current = await db.product.findUnique({ where: { id }, select: DELETE_PRODUCT_SELECT })
    if (!current) return { ok: false, error: 'not-found' }

    let blocked = false
    await db.$transaction(async (tx) => {
      const orderLineCount = await tx.orderLine.count({ where: { productId: id } })
      if (orderLineCount > 0) {
        blocked = true
        return
      }
      await tx.product.delete({ where: { id } })
    })
    if (blocked) return { ok: false, error: 'has-orders' }

    // Best-effort storage cleanup AFTER the delete transaction commits —
    // same idiom as `./structure.ts`'s post-commit cleanup: only `src`s read
    // from this product's own DB rows above (never anything client-supplied)
    // are ever passed to `deleteProductImageObject`, and a cleanup failure
    // never flips this already-successful delete's `ok` result (the helper
    // logs failures itself; we log again here with this function's tag).
    for (const image of current.images) {
      const deleted = await deleteProductImageObject(image.src)
      if (!deleted) console.error('[deleteProduct] failed to delete orphaned storage object', image.src)
    }

    return { ok: true, revalidate: await fullRevalidateTargetsFor(current) }
  } catch (error) {
    console.error('[deleteProduct] unexpected error', error)
    return { ok: false, error: 'error' }
  }
}
