import { describe, expect, it } from 'vitest'
import type { Category, Collection } from '@/types/catalog'
import { getAllCategories, getAllCollections, getAllProducts } from '@/features/catalog/lib/selectors'
import { toProductCreate, toVariantCreate } from '../../../../prisma/seed-mappers'
import {
  toDomainCategory,
  toDomainCollection,
  toDomainProduct,
  type CategoryRowForMapping,
  type CollectionRowForMapping,
  type ProductRowForMapping,
} from './mapper'

// Fixture id-maps covering every category/subcategory authored in
// `src/features/catalog/data/categories.ts`, in the same shape `prisma/seed-mappers.test.ts` uses.
const CATEGORY_IDS: Record<string, string> = {
  jewelry: 'cat_jewelry_id',
  beads: 'cat_beads_id',
  accessories: 'cat_accessories_id',
}

const SUBCATEGORY_IDS: Record<string, string> = {
  'jewelry:necklaces': 'sub_necklaces_id',
  'jewelry:bracelets': 'sub_bracelets_id',
  'jewelry:earrings': 'sub_earrings_id',
  'jewelry:anklets': 'sub_anklets_id',
  'jewelry:rings': 'sub_rings_id',
  'beads:loose-beads': 'sub_loose_beads_id',
  'beads:bead-strands': 'sub_bead_strands_id',
  'beads:waist-beads': 'sub_waist_beads_id',
  'accessories:bags': 'sub_bags_id',
  'accessories:hair': 'sub_hair_id',
  'accessories:other': 'sub_other_id',
}

/**
 * Simulates what Prisma returns for a seeded product: flattens the nested-create shapes from
 * `seed-mappers.ts` into included-relation rows, adding the relation slugs the real query includes.
 */
function simulateProductRow(product: ReturnType<typeof getAllProducts>[number]): ProductRowForMapping {
  const create = toProductCreate(product, CATEGORY_IDS, SUBCATEGORY_IDS)
  return {
    ...create,
    category: { slug: product.categorySlug },
    subcategory: product.subcategorySlug ? { slug: product.subcategorySlug } : null,
    images: create.images.create,
    optionTypes: create.optionTypes.create.map((t) => ({ name: t.name, position: t.position, values: t.values.create })),
    variants: product.variants.map((v) => ({ ...toVariantCreate(v), options: toVariantCreate(v).options.create })),
    collections: product.collectionSlugs.map((slug, position) => ({ position, collection: { slug } })),
  }
}

describe('toDomainProduct is the inverse of the seed mappers', () => {
  it.each(getAllProducts().map((p) => [p.slug, p] as const))('round-trips %s losslessly', (_slug, product) => {
    expect(toDomainProduct(simulateProductRow(product))).toEqual(product)
  })
})

/** Simulates a category row, deliberately reversed relative to the authored order to force the mapper to re-sort. */
function simulateCategoryRow(category: Category): CategoryRowForMapping {
  return {
    slug: category.slug,
    name: category.name,
    description: category.description ?? null,
    image: category.image ?? null,
    subcategories: [...category.subcategories].reverse().map((s) => ({ slug: s.slug, name: s.name })),
  }
}

describe('toDomainCategory is the inverse of the seed mappers (given the authored subcategory order)', () => {
  it.each(getAllCategories().map((c) => [c.slug, c] as const))('round-trips %s losslessly', (_slug, category) => {
    const subcategoryOrder = category.subcategories.map((s) => s.slug)
    expect(toDomainCategory(simulateCategoryRow(category), subcategoryOrder)).toEqual(category)
  })
})

/** Simulates a collection row, deliberately reversed relative to `position` to force the mapper to re-sort. */
function simulateCollectionRow(collection: Collection): CollectionRowForMapping {
  const reversed = [...collection.productSlugs].reverse()
  const lastIndex = collection.productSlugs.length - 1
  return {
    slug: collection.slug,
    name: collection.name,
    description: collection.description ?? null,
    image: collection.image ?? null,
    products: reversed.map((slug, i) => ({ position: lastIndex - i, product: { slug } })),
  }
}

describe('toDomainCollection is the inverse of the seed mappers', () => {
  it.each(getAllCollections().map((c) => [c.slug, c] as const))('round-trips %s losslessly', (_slug, collection) => {
    expect(toDomainCollection(simulateCollectionRow(collection))).toEqual(collection)
  })
})

// --- Edge cases not exercised (or not robustly exercised) by the real catalog data ---

const baseProductRow: ProductRowForMapping = {
  id: 'PROD-EDGE-1',
  slug: 'edge-product',
  sku: 'SKU-EDGE-1',
  name: 'Edge Product',
  shortDescription: 'A short description.',
  description: 'A longer description.',
  material: 'Gold vermeil',
  materialTags: [],
  badges: [],
  status: 'ACTIVE',
  priceNgnMinor: 100_000,
  priceUsdMinor: 500,
  salePriceNgnMinor: null,
  salePriceUsdMinor: null,
  inventory: 5,
  seoTitle: null,
  seoDescription: null,
  category: { slug: 'jewelry' },
  subcategory: null,
  images: [],
  optionTypes: [],
  variants: [],
  collections: [],
}

describe('toDomainProduct — defensive position sorting', () => {
  it('re-sorts images and optionTypes/values by position regardless of input order', () => {
    const row: ProductRowForMapping = {
      ...baseProductRow,
      images: [
        { src: 'b.jpg', alt: 'b', position: 1 },
        { src: 'a.jpg', alt: 'a', position: 0 },
      ],
      optionTypes: [
        {
          name: 'Color',
          position: 1,
          values: [
            { value: 'Gold', position: 1 },
            { value: 'Silver', position: 0 },
          ],
        },
        {
          name: 'Size',
          position: 0,
          values: [{ value: 'M', position: 0 }],
        },
      ],
    }

    const result = toDomainProduct(row)

    expect(result.images).toEqual([
      { src: 'a.jpg', alt: 'a' },
      { src: 'b.jpg', alt: 'b' },
    ])
    expect(result.optionTypes).toEqual([
      { name: 'Size', values: ['M'] },
      { name: 'Color', values: ['Silver', 'Gold'] },
    ])
  })

  it('re-sorts collections by position (nulls last) regardless of input order', () => {
    const row: ProductRowForMapping = {
      ...baseProductRow,
      collections: [
        { position: 1, collection: { slug: 'everyday' } },
        { position: null, collection: { slug: 'statement' } },
        { position: 0, collection: { slug: 'bridal' } },
      ],
    }

    expect(toDomainProduct(row).collectionSlugs).toEqual(['bridal', 'everyday', 'statement'])
  })
})

describe('toDomainProduct — sale price is both currencies or nothing', () => {
  it('maps a one-sided sale row (only NGN set) to salePriceSet undefined', () => {
    const row: ProductRowForMapping = { ...baseProductRow, salePriceNgnMinor: 90_000, salePriceUsdMinor: null }
    expect(toDomainProduct(row).salePriceSet).toBeUndefined()
  })

  it('maps a one-sided sale row (only USD set) to salePriceSet undefined', () => {
    const row: ProductRowForMapping = { ...baseProductRow, salePriceNgnMinor: null, salePriceUsdMinor: 450 }
    expect(toDomainProduct(row).salePriceSet).toBeUndefined()
  })

  it('maps a fully-authored sale row to a salePriceSet in both currencies', () => {
    const row: ProductRowForMapping = { ...baseProductRow, salePriceNgnMinor: 90_000, salePriceUsdMinor: 450 }
    expect(toDomainProduct(row).salePriceSet).toEqual({
      ngn: { amountMinor: 90_000, currency: 'NGN' },
      usd: { amountMinor: 450, currency: 'USD' },
    })
  })
})

describe('toDomainProduct — variant option ordering', () => {
  it('re-orders variant options (reverse input) to match the optionTypes name order', () => {
    const row: ProductRowForMapping = {
      ...baseProductRow,
      optionTypes: [
        { name: 'Size', position: 0, values: [{ value: 'M', position: 0 }] },
        { name: 'Color', position: 1, values: [{ value: 'Gold', position: 0 }] },
      ],
      variants: [
        {
          id: 'VAR-1',
          sku: 'SKU-VAR-1',
          inventory: 2,
          priceNgnMinor: null,
          priceUsdMinor: null,
          image: null,
          options: [
            { name: 'Color', value: 'Gold' },
            { name: 'Size', value: 'M' },
          ],
        },
      ],
    }

    const result = toDomainProduct(row)

    expect(result.variants).toEqual([
      { id: 'VAR-1', sku: 'SKU-VAR-1', options: [{ name: 'Size', value: 'M' }, { name: 'Color', value: 'Gold' }], inventory: 2 },
    ])
  })
})

describe('toDomainProduct — nullable-to-optional fields', () => {
  it('maps null seoTitle/seoDescription to an empty seo object', () => {
    expect(toDomainProduct(baseProductRow).seo).toEqual({})
  })

  it('maps a null subcategory to subcategorySlug undefined', () => {
    expect(toDomainProduct(baseProductRow).subcategorySlug).toBeUndefined()
  })

  it('maps a variant with a null image to image undefined', () => {
    const row: ProductRowForMapping = {
      ...baseProductRow,
      variants: [
        {
          id: 'VAR-1',
          sku: 'SKU-VAR-1',
          inventory: 1,
          priceNgnMinor: null,
          priceUsdMinor: null,
          image: null,
          options: [],
        },
      ],
    }
    expect(toDomainProduct(row).variants[0].image).toBeUndefined()
  })
})

describe('toDomainProduct — enum mapping', () => {
  it("maps status DRAFT to 'draft'", () => {
    expect(toDomainProduct({ ...baseProductRow, status: 'DRAFT' }).status).toBe('draft')
  })

  it("maps status ACTIVE to 'active'", () => {
    expect(toDomainProduct({ ...baseProductRow, status: 'ACTIVE' }).status).toBe('active')
  })

  it("maps Badge.NEW / Badge.BEST_SELLER to 'new' / 'best-seller'", () => {
    expect(toDomainProduct({ ...baseProductRow, badges: ['NEW', 'BEST_SELLER'] }).badges).toEqual([
      'new',
      'best-seller',
    ])
  })
})

describe('toDomainCategory — nullable-to-optional fields', () => {
  it('maps null description/image to undefined and injects categorySlug on each subcategory', () => {
    const row: CategoryRowForMapping = {
      slug: 'jewelry',
      name: 'Jewelry',
      description: null,
      image: null,
      subcategories: [{ slug: 'necklaces', name: 'Necklaces' }],
    }
    const result = toDomainCategory(row, ['necklaces'])
    expect(result.description).toBeUndefined()
    expect(result.image).toBeUndefined()
    expect(result.subcategories).toEqual([{ slug: 'necklaces', name: 'Necklaces', categorySlug: 'jewelry' }])
  })
})

describe('toDomainCollection — nullable-to-optional fields', () => {
  it('maps null description/image to undefined', () => {
    const row: CollectionRowForMapping = {
      slug: 'bridal',
      name: 'Bridal',
      description: null,
      image: null,
      products: [],
    }
    const result = toDomainCollection(row)
    expect(result.description).toBeUndefined()
    expect(result.image).toBeUndefined()
    expect(result.productSlugs).toEqual([])
  })
})
