// Idempotent catalog seed: upserts categories -> subcategories -> collections -> products
// (with nested variants/options/images/optionTypes) -> product<->collection joins, from the
// Phase 2 mock catalog data (`src/features/catalog/data/*`).
//
// Idempotency: every write is an `upsert` keyed on a natural unique constraint (slug/sku, or a
// composite key for child rows), so re-running this script is safe and produces no duplicates.
// This script never deletes anything, and it never touches Order/OrderLine/Profile/Address/
// Cart/CartItem/Wishlist/WishlistItem — those are out of scope for a catalog reseed.
//
// Run via `npm run db:seed` (Task 7) once a database connection is available. Do NOT run this
// from Task 6 — it requires `DATABASE_URL`/`DIRECT_URL`, which this task does not set up.

import { db } from '@/lib/db'
import { getAllCategories, getAllCollections, getAllProducts } from '@/features/catalog/lib/selectors'
import { toProductCreate } from './seed-mappers'

async function seedCategories(): Promise<Record<string, string>> {
  const categoryIdBySlug: Record<string, string> = {}

  for (const category of getAllCategories()) {
    const row = await db.category.upsert({
      where: { slug: category.slug },
      create: {
        slug: category.slug,
        name: category.name,
        description: category.description ?? null,
        image: category.image ?? null,
      },
      update: {
        name: category.name,
        description: category.description ?? null,
        image: category.image ?? null,
      },
    })
    categoryIdBySlug[category.slug] = row.id
  }

  return categoryIdBySlug
}

/** Keyed on `${categorySlug}:${subcategorySlug}` — `Subcategory.slug` is only unique per-category. */
async function seedSubcategories(categoryIdBySlug: Record<string, string>): Promise<Record<string, string>> {
  const subcategoryIdByKey: Record<string, string> = {}

  for (const category of getAllCategories()) {
    const categoryId = categoryIdBySlug[category.slug]
    if (!categoryId) {
      throw new Error(`seedSubcategories: missing category id for slug "${category.slug}"`)
    }

    for (const subcategory of category.subcategories) {
      const row = await db.subcategory.upsert({
        where: { categoryId_slug: { categoryId, slug: subcategory.slug } },
        create: { slug: subcategory.slug, name: subcategory.name, categoryId },
        update: { name: subcategory.name },
      })
      subcategoryIdByKey[`${category.slug}:${subcategory.slug}`] = row.id
    }
  }

  return subcategoryIdByKey
}

async function seedCollections(): Promise<Record<string, string>> {
  const collectionIdBySlug: Record<string, string> = {}

  for (const collection of getAllCollections()) {
    const row = await db.collection.upsert({
      where: { slug: collection.slug },
      create: {
        slug: collection.slug,
        name: collection.name,
        description: collection.description ?? null,
        image: collection.image ?? null,
      },
      update: {
        name: collection.name,
        description: collection.description ?? null,
        image: collection.image ?? null,
      },
    })
    collectionIdBySlug[collection.slug] = row.id
  }

  return collectionIdBySlug
}

async function seedProducts(
  categoryIdBySlug: Record<string, string>,
  subcategoryIdByKey: Record<string, string>,
  collectionIdBySlug: Record<string, string>,
): Promise<void> {
  for (const product of getAllProducts()) {
    const mapped = toProductCreate(product, categoryIdBySlug, subcategoryIdByKey)

    // Top-level product row. Nested relations are only attached on first insert (`create`);
    // on re-seed (`update`) only scalar fields change here — child rows are upserted
    // individually below, by their own natural unique keys, so nothing is ever deleted.
    const dbProduct = await db.product.upsert({
      where: { slug: mapped.slug },
      create: mapped,
      update: {
        name: mapped.name,
        shortDescription: mapped.shortDescription,
        description: mapped.description,
        material: mapped.material,
        materialTags: mapped.materialTags,
        badges: mapped.badges,
        status: mapped.status,
        priceNgnMinor: mapped.priceNgnMinor,
        priceUsdMinor: mapped.priceUsdMinor,
        salePriceNgnMinor: mapped.salePriceNgnMinor,
        salePriceUsdMinor: mapped.salePriceUsdMinor,
        inventory: mapped.inventory,
        seoTitle: mapped.seoTitle,
        seoDescription: mapped.seoDescription,
        categoryId: mapped.categoryId,
        subcategoryId: mapped.subcategoryId,
      },
    })

    for (const image of mapped.images.create) {
      await db.productImage.upsert({
        where: { productId_position: { productId: dbProduct.id, position: image.position } },
        create: { ...image, productId: dbProduct.id },
        update: { src: image.src, alt: image.alt },
      })
    }

    for (const variantRow of mapped.variants.create) {
      const dbVariant = await db.productVariant.upsert({
        where: { sku: variantRow.sku },
        create: {
          sku: variantRow.sku,
          inventory: variantRow.inventory,
          priceNgnMinor: variantRow.priceNgnMinor,
          priceUsdMinor: variantRow.priceUsdMinor,
          image: variantRow.image,
          productId: dbProduct.id,
        },
        update: {
          inventory: variantRow.inventory,
          priceNgnMinor: variantRow.priceNgnMinor,
          priceUsdMinor: variantRow.priceUsdMinor,
          image: variantRow.image,
        },
      })

      for (const optionRow of variantRow.options.create) {
        await db.variantOption.upsert({
          where: { variantId_name: { variantId: dbVariant.id, name: optionRow.name } },
          create: { ...optionRow, variantId: dbVariant.id },
          update: { value: optionRow.value },
        })
      }
    }

    for (const typeRow of mapped.optionTypes.create) {
      const dbOptionType = await db.productOptionType.upsert({
        where: { productId_name: { productId: dbProduct.id, name: typeRow.name } },
        create: { name: typeRow.name, position: typeRow.position, productId: dbProduct.id },
        update: { position: typeRow.position },
      })

      for (const valueRow of typeRow.values.create) {
        await db.productOptionValue.upsert({
          where: { optionTypeId_value: { optionTypeId: dbOptionType.id, value: valueRow.value } },
          create: { ...valueRow, optionTypeId: dbOptionType.id },
          update: { position: valueRow.position },
        })
      }
    }

    for (const [position, collectionSlug] of product.collectionSlugs.entries()) {
      const collectionId = collectionIdBySlug[collectionSlug]
      if (!collectionId) {
        throw new Error(`seedProducts: unknown collection slug "${collectionSlug}" for product "${product.slug}"`)
      }
      await db.productCollection.upsert({
        where: { productId_collectionId: { productId: dbProduct.id, collectionId } },
        create: { productId: dbProduct.id, collectionId, position },
        update: { position },
      })
    }
  }
}

async function main(): Promise<void> {
  const categoryIdBySlug = await seedCategories()
  const subcategoryIdByKey = await seedSubcategories(categoryIdBySlug)
  const collectionIdBySlug = await seedCollections()
  await seedProducts(categoryIdBySlug, subcategoryIdByKey, collectionIdBySlug)
}

main()
  .then(async () => {
    await db.$disconnect()
  })
  .catch(async (error: unknown) => {
    console.error(error)
    await db.$disconnect()
    process.exitCode = 1
  })
