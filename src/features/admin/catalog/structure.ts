import 'server-only'
import { z } from 'zod'
import { db } from '@/lib/db'
import { deleteProductImageObject } from './images'
import { computeProductRevalidateTargets, type CatalogWriteResult } from './products'

/**
 * The admin catalog STRUCTURE engine: two edits that reshape a product's
 * graph rather than its scalars — `updateProductImages` (replace-set) and
 * `updateProductVariants` (add/delete variants, replace optionTypes).
 * Siblings to `updateProduct` (`./products.ts`) and `createProduct`
 * (`./create.ts`); this file never touches product scalars, and the other
 * two never touch images or variant structure, so the three stay separate
 * engines sharing only `CatalogWriteResult`/`CatalogWriteError` and the pure
 * `computeProductRevalidateTargets`.
 *
 * Ungated by design — the caller reaches this through actions.ts, which
 * re-checks ADMIN (server actions are public endpoints; the (admin) layout
 * gate covers rendering only).
 *
 * `updateProductImages` is a REPLACE-SET write: the submitted array becomes
 * the product's full image list (order = position, alts updated), inside
 * ONE `$transaction` (`deleteMany` + `createMany`) so the set is atomic —
 * never a moment with zero rows visible to a concurrent read. Storage
 * cleanup for rows the replace dropped happens AFTER the transaction
 * commits, and — this is a pinned security property carried over from
 * `./images.ts`'s review — is called ONLY with `src`s that were already
 * present in this product's DB rows before the write. A client-submitted
 * `src` that never existed in the DB is never passed to
 * `deleteProductImageObject`, so a malicious payload cannot use this path to
 * delete an arbitrary object out of the bucket. Delete failures are logged,
 * not surfaced — a stray storage object is a minor cleanup miss, not a
 * correctness bug, and must not fail an otherwise-successful DB write.
 *
 * `updateProductVariants` edits variant STRUCTURE: add new variants (with
 * options), delete existing ones, and replace the product's optionTypes —
 * all validated BEFORE the transaction opens, with one guard that can only
 * be checked transactionally: deleting a variant that any `OrderLine` still
 * references is refused (`'variant-has-orders'`) with NO writes, checked
 * first thing inside the `$transaction` so the guard and the writes it
 * gates share one atomic view. `VariantOption` rows cascade off their
 * `ProductVariant` (`onDelete: Cascade`, `prisma/schema.prisma`), so
 * deleting a variant needs no separate child-row cleanup; `CartItem` rows
 * referencing a deleted variant cascade the same way, so this file never
 * writes to `cart` tables. `OrderLine.variantId` is `onDelete: SetNull`
 * (deliberately — it's a denormalized snapshot, not a live join), which is
 * exactly why the guard exists: without it, deleting a variant would
 * silently null out order history's variant reference instead of refusing.
 */

const updateProductImagesSchema = z.object({
  images: z
    .array(
      z.object({
        src: z.string().url(),
        alt: z.string().trim().min(1).max(200),
      }),
    )
    .min(1)
    .max(8),
})

const updateProductVariantsSchema = z
  .object({
    addVariants: z.array(
      z.object({
        sku: z.string().trim().min(1).max(64),
        inventory: z.number().int().min(0),
        priceNgnMinor: z.number().int().positive().nullable(),
        priceUsdMinor: z.number().int().positive().nullable(),
        options: z
          .array(
            z.object({
              name: z.string().trim().min(1),
              value: z.string().trim().min(1),
            }),
          )
          .min(1),
      }),
    ),
    deleteVariantIds: z.array(z.string().min(1)),
    optionTypes: z
      .array(
        z.object({
          name: z.string().trim().min(1).max(40),
          values: z.array(z.string().trim().min(1).max(40)).min(1).max(20),
        }),
      )
      .max(3),
  })
  .superRefine((data, ctx) => {
    const valuesByOptionTypeName = new Map(data.optionTypes.map((optionType) => [optionType.name, new Set(optionType.values)]))

    const seenVariantSkus = new Set<string>()
    data.addVariants.forEach((variant, variantIndex) => {
      if (seenVariantSkus.has(variant.sku))
        ctx.addIssue({ code: 'custom', path: ['addVariants', variantIndex, 'sku'], message: 'Duplicate variant SKU' })
      seenVariantSkus.add(variant.sku)

      variant.options.forEach((option, optionIndex) => {
        const allowedValues = valuesByOptionTypeName.get(option.name)
        if (!allowedValues || !allowedValues.has(option.value))
          ctx.addIssue({
            code: 'custom',
            path: ['addVariants', variantIndex, 'options', optionIndex],
            message: `Option "${option.name}: ${option.value}" is not listed in optionTypes`,
          })
      })
    })
  })

/** Same shape as the private one in `./products.ts` (not exported there) — duplicated here the same way
 * `./create.ts` duplicates `collectionSlugsFor`, so each engine file stays self-contained. */
const TARGETS_SELECT = {
  slug: true,
  category: { select: { slug: true } },
  subcategory: { select: { slug: true } },
  collections: { select: { collectionId: true } },
} as const

async function collectionSlugsFor(collectionIds: string[]): Promise<string[]> {
  if (collectionIds.length === 0) return []
  const rows = await db.collection.findMany({ where: { id: { in: collectionIds } }, select: { slug: true } })
  return rows.map((row) => row.slug)
}

async function fullRevalidateTargetsFor(row: {
  slug: string
  category: { slug: string }
  subcategory: { slug: string } | null
  collections: { collectionId: string }[]
}): Promise<string[]> {
  return computeProductRevalidateTargets({
    beforeSlug: row.slug,
    afterSlug: row.slug,
    categorySlugs: row.subcategory ? [row.category.slug, `${row.category.slug}/${row.subcategory.slug}`] : [row.category.slug],
    collectionSlugs: await collectionSlugsFor(row.collections.map((c) => c.collectionId)),
    stockOnly: false,
  })
}

/**
 * Replaces the product's image SET: order = array order, alts updated.
 * Requires ≥1 image (enforced by the schema). Deletes + recreates every row
 * inside ONE `$transaction`; storage cleanup for removed `src`s runs AFTER
 * that transaction commits and ONLY for `src`s pulled from the pre-write DB
 * rows (see file docblock for why). Images show on listing cards as well as
 * the PDP, so this is never a stock-only write — full revalidate targets.
 */
export async function updateProductImages(id: string, input: unknown): Promise<CatalogWriteResult> {
  const parsed = updateProductImagesSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'invalid-input', issues: parsed.error.issues }
  const data = parsed.data

  try {
    const current = await db.product.findUnique({ where: { id }, select: TARGETS_SELECT })
    if (!current) return { ok: false, error: 'not-found' }

    const previousImages = await db.productImage.findMany({ where: { productId: id }, select: { src: true } })

    await db.$transaction(async (tx) => {
      await tx.productImage.deleteMany({ where: { productId: id } })
      await tx.productImage.createMany({
        data: data.images.map((image, index) => ({ productId: id, src: image.src, alt: image.alt, position: index })),
      })
    })

    const submittedSrcs = new Set(data.images.map((image) => image.src))
    const removedSrcs = previousImages.map((image) => image.src).filter((src) => !submittedSrcs.has(src))
    for (const src of removedSrcs) {
      const deleted = await deleteProductImageObject(src)
      if (!deleted) console.error('[updateProductImages] failed to delete orphaned storage object', src)
    }

    return { ok: true, revalidate: await fullRevalidateTargetsFor(current) }
  } catch (error) {
    console.error('[updateProductImages] unexpected error', error)
    return { ok: false, error: 'error' }
  }
}

/**
 * Variant-structure edits on an existing product: add new variants (with
 * options), delete variants that carry no order lines
 * (`'variant-has-orders'` otherwise, checked in-tx), and replace the
 * product's optionTypes wholesale — refused as `'invalid-input'` if any
 * SURVIVING variant (existing minus deleted, plus added) would reference an
 * option name/value the new optionTypes no longer declare.
 */
export async function updateProductVariants(id: string, input: unknown): Promise<CatalogWriteResult> {
  const parsed = updateProductVariantsSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'invalid-input', issues: parsed.error.issues }
  const data = parsed.data

  try {
    const current = await db.product.findUnique({ where: { id }, select: TARGETS_SELECT })
    if (!current) return { ok: false, error: 'not-found' }

    const existingVariants = await db.productVariant.findMany({
      where: { productId: id },
      select: { id: true, options: { select: { name: true, value: true } } },
    })
    const existingVariantIds = new Set(existingVariants.map((variant) => variant.id))

    for (const variantId of data.deleteVariantIds) {
      if (!existingVariantIds.has(variantId)) return { ok: false, error: 'invalid-input' }
    }

    if (data.addVariants.length > 0) {
      const variantSkuConflict = await db.productVariant.findFirst({
        where: { sku: { in: data.addVariants.map((variant) => variant.sku) }, NOT: { productId: id } },
      })
      if (variantSkuConflict) return { ok: false, error: 'conflict-sku' }
    }

    const deleteVariantIdSet = new Set(data.deleteVariantIds)
    const survivingExistingOptions = existingVariants
      .filter((variant) => !deleteVariantIdSet.has(variant.id))
      .flatMap((variant) => variant.options)
    const addedOptions = data.addVariants.flatMap((variant) => variant.options)

    const newValuesByOptionTypeName = new Map(data.optionTypes.map((optionType) => [optionType.name, new Set(optionType.values)]))
    for (const option of [...survivingExistingOptions, ...addedOptions]) {
      const allowedValues = newValuesByOptionTypeName.get(option.name)
      if (!allowedValues || !allowedValues.has(option.value)) return { ok: false, error: 'invalid-input' }
    }

    let blocked = false
    await db.$transaction(async (tx) => {
      const orderLineCount = await tx.orderLine.count({ where: { variantId: { in: data.deleteVariantIds } } })
      if (orderLineCount > 0) {
        blocked = true
        return
      }

      if (data.deleteVariantIds.length > 0) {
        await tx.productVariant.deleteMany({ where: { id: { in: data.deleteVariantIds } } })
      }

      await tx.productOptionType.deleteMany({ where: { productId: id } })
      for (const [typeIndex, optionType] of data.optionTypes.entries()) {
        const createdType = await tx.productOptionType.create({
          data: { productId: id, name: optionType.name, position: typeIndex },
        })
        await tx.productOptionValue.createMany({
          data: optionType.values.map((value, valueIndex) => ({
            optionTypeId: createdType.id,
            value,
            position: valueIndex,
          })),
        })
      }

      for (const newVariant of data.addVariants) {
        const createdVariant = await tx.productVariant.create({
          data: {
            productId: id,
            sku: newVariant.sku,
            inventory: newVariant.inventory,
            priceNgnMinor: newVariant.priceNgnMinor,
            priceUsdMinor: newVariant.priceUsdMinor,
          },
        })
        await tx.variantOption.createMany({
          data: newVariant.options.map((option) => ({
            variantId: createdVariant.id,
            name: option.name,
            value: option.value,
          })),
        })
      }
    })
    if (blocked) return { ok: false, error: 'variant-has-orders' }

    return { ok: true, revalidate: await fullRevalidateTargetsFor(current) }
  } catch (error) {
    console.error('[updateProductVariants] unexpected error', error)
    return { ok: false, error: 'error' }
  }
}
