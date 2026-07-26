import 'server-only'
import { db } from '@/lib/db'
import { createProductSchema } from './schema'
import { computeProductRevalidateTargets, type CatalogWriteResult } from './products'

/**
 * The admin catalog product-CREATION engine: builds a brand-new product's
 * full graph — scalars, option types/values, variants + their options,
 * images, and collection memberships — in one `$transaction`. Sibling to
 * `updateProduct` (`./products.ts`); the two never overlap in what they
 * write (this never touches an existing product, `updateProduct` never
 * creates one), so they stay separate engines sharing only the result
 * types and the pure `computeProductRevalidateTargets`.
 *
 * Ungated by design — the caller reaches this through actions.ts, which
 * re-checks ADMIN (server actions are public endpoints; the (admin) layout
 * gate covers rendering only).
 *
 * Conflict pre-checks mirror `updateProduct`'s shapes exactly, minus the
 * `NOT: { id }` clause — there is no existing row to exclude, so slug/sku/
 * variant-sku are checked against ALL products. Never throws: any error
 * (validation, conflict, taxonomy, or a database throw) collapses to a
 * typed result; a database throw during or after the transaction leaves no
 * partial state, since every child row is written inside the single
 * `$transaction`.
 */

async function collectionSlugsFor(collectionIds: string[]): Promise<string[]> {
  if (collectionIds.length === 0) return []
  const rows = await db.collection.findMany({ where: { id: { in: collectionIds } }, select: { slug: true } })
  return rows.map((row) => row.slug)
}

export async function createProduct(input: unknown): Promise<CatalogWriteResult & { productId?: string }> {
  const parsed = createProductSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'invalid-input', issues: parsed.error.issues }
  const data = parsed.data

  try {
    const slugConflict = await db.product.findFirst({ where: { slug: data.slug } })
    if (slugConflict) return { ok: false, error: 'conflict-slug' }

    const skuConflict = await db.product.findFirst({ where: { sku: data.sku } })
    if (skuConflict) return { ok: false, error: 'conflict-sku' }

    if (data.newVariants.length > 0) {
      const variantSkuConflict = await db.productVariant.findFirst({
        where: { sku: { in: data.newVariants.map((variant) => variant.sku) } },
      })
      if (variantSkuConflict) return { ok: false, error: 'conflict-sku' }
    }

    const category = await db.category.findUnique({ where: { id: data.categoryId }, select: { slug: true } })
    if (!category) return { ok: false, error: 'invalid-taxonomy' }

    let subcategorySlug: string | null = null
    if (data.subcategoryId) {
      const subcategory = await db.subcategory.findUnique({ where: { id: data.subcategoryId } })
      if (!subcategory || subcategory.categoryId !== data.categoryId) return { ok: false, error: 'invalid-taxonomy' }
      subcategorySlug = subcategory.slug
    }

    let productId = ''
    await db.$transaction(async (tx) => {
      const product = await tx.product.create({
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
      productId = product.id

      for (const [typeIndex, optionType] of data.optionTypes.entries()) {
        const createdType = await tx.productOptionType.create({
          data: { productId: product.id, name: optionType.name, position: typeIndex },
        })
        await tx.productOptionValue.createMany({
          data: optionType.values.map((value, valueIndex) => ({
            optionTypeId: createdType.id,
            value,
            position: valueIndex,
          })),
        })
      }

      for (const newVariant of data.newVariants) {
        const createdVariant = await tx.productVariant.create({
          data: {
            productId: product.id,
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

      await tx.productImage.createMany({
        data: data.images.map((image, index) => ({
          productId: product.id,
          src: image.src,
          alt: image.alt,
          position: index,
        })),
      })

      if (data.collectionIds.length > 0) {
        await tx.productCollection.createMany({
          data: data.collectionIds.map((collectionId) => ({ productId: product.id, collectionId })),
          skipDuplicates: true,
        })
      }
    })

    const targets = computeProductRevalidateTargets({
      beforeSlug: data.slug,
      afterSlug: data.slug,
      categorySlugs: subcategorySlug ? [category.slug, `${category.slug}/${subcategorySlug}`] : [category.slug],
      collectionSlugs: await collectionSlugsFor(data.collectionIds),
      stockOnly: false,
    })
    return { ok: true, revalidate: targets, productId }
  } catch (error) {
    console.error('[createProduct] unexpected error', error)
    return { ok: false, error: 'error' }
  }
}
