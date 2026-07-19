// Convergent catalog seed: upserts categories -> subcategories -> collections -> products
// (with nested variants/options/images/optionTypes) -> product<->collection joins, from the
// Phase 2 mock catalog data (`src/features/catalog/data/*`).
//
// Idempotency: every write is an `upsert` keyed on a natural unique constraint (slug/sku, or a
// composite key for child rows), so re-running this script is safe and produces no duplicates.
//
// Convergence: each product's write (the product row plus its images/variants/optionTypes/
// collection joins) runs inside its own `db.$transaction`, so a failure partway through never
// leaves that product half-written. Within the transaction, stale children — no longer present
// in the fixture — are pruned so the DB actually converges to match `products.ts` on re-seed,
// not just accumulates: `ProductImage` rows beyond the fixture's image count, `ProductVariant`
// rows whose sku is no longer authored, `ProductOptionType` rows (recreated wholesale — see
// below), and `ProductCollection` joins for collections the product no longer belongs to.
// `ProductOptionType`/`ProductOptionValue` are deleted and recreated in full for the product on
// every run rather than upserted-and-pruned: they're authored data with no external references
// (nothing else has a foreign key to them), so this is both idempotent and immune to the
// transient `@@unique([productId, position])` collision that upserting a reordered position
// in place would hit (e.g. swapping two option types' positions one upsert at a time).
//
// This script iterates the raw `products` array (every authored product, draft or active),
// not the `getAllProducts()` selector, so that flipping a fixture product to `status: 'draft'`
// and re-seeding actually writes `status: 'draft'` to that row — `getAllProducts()` filters to
// `status === 'active'` for customer-facing surfaces, which would silently skip draft products
// here and leave their DB row's status stale (a no-op on unpublish). This script still never
// deletes a `Product` row itself, and it never touches Order/OrderLine/Profile/Address/
// Cart/CartItem/Wishlist/WishlistItem — those are out of scope for a catalog reseed.
//
// Run via `npm run db:seed` (Task 7) once a database connection is available. Do NOT run this
// from Task 6 — it requires `DATABASE_URL`/`DIRECT_URL`, which this task does not set up.

// Must precede the `@/lib/db` import: unlike Next.js and prisma.config.ts, a standalone
// `tsx` process does not load `.env` on its own, so DATABASE_URL would be undefined.
import 'dotenv/config'

import { db } from '@/lib/db'
import { getAllCategories, getAllCollections } from '@/features/catalog/lib/selectors'
// Deliberately the raw fixture array, not `getAllProducts()` — see the header comment above.
import { products } from '@/features/catalog/data/products'
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
  for (const product of products) {
    const mapped = toProductCreate(product, categoryIdBySlug, subcategoryIdByKey)

    // Each product's entire write is one transaction: if anything below throws, this
    // product's row and all its children are rolled back together rather than left
    // half-written for the next run to limp through.
    await db.$transaction(async (tx) => {
      // Top-level product row. Nested relations are only attached on first insert (`create`);
      // on re-seed (`update`) only scalar fields change here — child rows are upserted/pruned
      // individually below, by their own natural unique keys.
      const dbProduct = await tx.product.upsert({
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

      // --- Images: upsert current positions, then prune positions the fixture dropped ---
      for (const image of mapped.images.create) {
        await tx.productImage.upsert({
          where: { productId_position: { productId: dbProduct.id, position: image.position } },
          create: { ...image, productId: dbProduct.id },
          update: { src: image.src, alt: image.alt },
        })
      }
      await tx.productImage.deleteMany({
        where: { productId: dbProduct.id, position: { gte: mapped.images.create.length } },
      })

      // --- Variants: upsert current skus, then prune skus the fixture dropped ---
      // (kept as upsert-and-prune, not delete-and-recreate: unlike option types, variants are
      // referenced by CartItem/OrderLine, so unrelated/unchanged variants must keep their id.)
      for (const variantRow of mapped.variants.create) {
        const dbVariant = await tx.productVariant.upsert({
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
          await tx.variantOption.upsert({
            where: { variantId_name: { variantId: dbVariant.id, name: optionRow.name } },
            create: { ...optionRow, variantId: dbVariant.id },
            update: { value: optionRow.value },
          })
        }
      }
      const fixtureVariantSkus = mapped.variants.create.map((v) => v.sku)
      if (fixtureVariantSkus.length === 0) {
        await tx.productVariant.deleteMany({ where: { productId: dbProduct.id } })
      } else {
        await tx.productVariant.deleteMany({
          where: { productId: dbProduct.id, sku: { notIn: fixtureVariantSkus } },
        })
      }

      // --- Option types/values: delete and recreate wholesale, not upsert-in-place ---
      // Upserting a reordered `position` in place (keyed on productId_name) can transiently
      // collide with `@@unique([productId, position])` when two types/values swap positions
      // (whichever is written first temporarily wants a position the other still holds).
      // Deleting first sidesteps that entirely, is idempotent, and is safe because nothing
      // outside Product has a foreign key to ProductOptionType/ProductOptionValue.
      await tx.productOptionType.deleteMany({ where: { productId: dbProduct.id } })
      for (const typeRow of mapped.optionTypes.create) {
        await tx.productOptionType.create({
          data: {
            name: typeRow.name,
            position: typeRow.position,
            productId: dbProduct.id,
            values: { create: typeRow.values.create },
          },
        })
      }

      // --- Collection joins: upsert current, then prune collections the fixture dropped ---
      const fixtureCollectionIds: string[] = []
      for (const [position, collectionSlug] of product.collectionSlugs.entries()) {
        const collectionId = collectionIdBySlug[collectionSlug]
        if (!collectionId) {
          throw new Error(`seedProducts: unknown collection slug "${collectionSlug}" for product "${product.slug}"`)
        }
        fixtureCollectionIds.push(collectionId)
        await tx.productCollection.upsert({
          where: { productId_collectionId: { productId: dbProduct.id, collectionId } },
          create: { productId: dbProduct.id, collectionId, position },
          update: { position },
        })
      }
      if (fixtureCollectionIds.length === 0) {
        await tx.productCollection.deleteMany({ where: { productId: dbProduct.id } })
      } else {
        await tx.productCollection.deleteMany({
          where: { productId: dbProduct.id, collectionId: { notIn: fixtureCollectionIds } },
        })
      }
    })
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
