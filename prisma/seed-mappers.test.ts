import { describe, expect, it } from 'vitest'
import type { Product, ProductVariant as CatalogVariant } from '@/types/catalog'
import { getAllProducts } from '@/features/catalog/lib/selectors'
import {
  toBadges,
  toImageCreate,
  toOptionTypesCreate,
  toProductCreate,
  toVariantCreate,
  toVariantOptionCreate,
} from './seed-mappers'

// Real fixtures, picked because their authored option order is deliberately
// non-alphabetical (per the task brief) so alphabetisation would fail the
// order assertions below.
const allProducts = getAllProducts()
const colorwayNecklace = allProducts.find((p) => p.slug === 'beaded-layered-necklace-multicolor') // optionTypes: Color: Turquoise|Coral|Ivory, badges: ['new']
const waistBeads = allProducts.find((p) => p.slug === 'traditional-waist-beads-single-strand') // optionTypes: Size: S|M|L|XL, badges: ['best-seller']
const saleProduct = allProducts.find((p) => p.slug === 'gold-accent-waist-beads-double-strand') // salePriceSet present, no variants/optionTypes
const seoProduct = allProducts.find((p) => p.slug === 'beaded-stack-bracelet') // seo.title/description populated

if (!colorwayNecklace || !waistBeads || !saleProduct || !seoProduct) {
  throw new Error('Fixture products missing from catalog data — update test fixture slugs.')
}

/** Hand-made minimal product: no subcategorySlug, no salePriceSet, no seo, no variants/optionTypes. */
const minimalProduct: Product = {
  id: 'TEST-MINIMAL-001',
  name: 'Minimal Test Product',
  slug: 'minimal-test-product',
  shortDescription: 'A minimal fixture product.',
  description: 'A hand-made product used to test edge cases the real catalog data does not cover.',
  priceSet: {
    ngn: { amountMinor: 100_000, currency: 'NGN' },
    usd: { amountMinor: 500, currency: 'USD' },
  },
  sku: 'TEST-SKU-001',
  inventory: 3,
  material: 'Test material',
  materialTags: ['Tag A', 'Tag B'],
  categorySlug: 'jewelry',
  // deliberately no subcategorySlug
  collectionSlugs: [],
  images: [
    { src: 'https://example.com/1.jpg', alt: 'first' },
    { src: 'https://example.com/2.jpg', alt: 'second' },
  ],
  optionTypes: [],
  variants: [],
  badges: [],
  status: 'active',
  seo: {},
}

const categoryIdBySlug: Record<string, string> = {
  jewelry: 'cat_jewelry_id',
  beads: 'cat_beads_id',
  accessories: 'cat_accessories_id',
}

// Subcategory slugs are only unique per-category, so the map is keyed on a
// composite `${categorySlug}:${subcategorySlug}` string.
const subcategoryIdByKey: Record<string, string> = {
  'jewelry:necklaces': 'sub_necklaces_id',
  'jewelry:bracelets': 'sub_bracelets_id',
  'beads:waist-beads': 'sub_waistbeads_id',
}

describe('toProductCreate — money mapping', () => {
  it('maps priceSet to integer minor units in both currencies', () => {
    const result = toProductCreate(seoProduct, categoryIdBySlug, subcategoryIdByKey)
    expect(result.priceNgnMinor).toBe(seoProduct.priceSet.ngn.amountMinor)
    expect(result.priceUsdMinor).toBe(seoProduct.priceSet.usd.amountMinor)
    expect(Number.isInteger(result.priceNgnMinor)).toBe(true)
    expect(Number.isInteger(result.priceUsdMinor)).toBe(true)
  })

  it('maps salePriceSet to nullable sale columns when present', () => {
    expect(saleProduct.salePriceSet).toBeDefined()
    const result = toProductCreate(saleProduct, categoryIdBySlug, subcategoryIdByKey)
    expect(result.salePriceNgnMinor).toBe(saleProduct.salePriceSet!.ngn.amountMinor)
    expect(result.salePriceUsdMinor).toBe(saleProduct.salePriceSet!.usd.amountMinor)
  })

  it('maps absent salePriceSet to null sale columns', () => {
    expect(minimalProduct.salePriceSet).toBeUndefined()
    const result = toProductCreate(minimalProduct, categoryIdBySlug, subcategoryIdByKey)
    expect(result.salePriceNgnMinor).toBeNull()
    expect(result.salePriceUsdMinor).toBeNull()
  })
})

describe('toProductCreate — materialTags', () => {
  it('passes materialTags through unchanged', () => {
    const result = toProductCreate(minimalProduct, categoryIdBySlug, subcategoryIdByKey)
    expect(result.materialTags).toEqual(['Tag A', 'Tag B'])
  })
})

describe('toVariantCreate / toVariantOptionCreate — variant option flattening', () => {
  it('flattens a variant options array to one VariantOption row per entry', () => {
    const variant: CatalogVariant = {
      id: 'V1',
      sku: 'TEST-VAR-1',
      options: [
        { name: 'Size', value: '18cm' },
        { name: 'Color', value: 'Gold' },
      ],
      inventory: 5,
    }
    const rows = toVariantOptionCreate(variant.options)
    expect(rows).toEqual([
      { name: 'Size', value: '18cm' },
      { name: 'Color', value: 'Gold' },
    ])

    const created = toVariantCreate(variant)
    expect(created.options).toEqual({
      create: [
        { name: 'Size', value: '18cm' },
        { name: 'Color', value: 'Gold' },
      ],
    })
  })

  it('maps a variant price override to nullable price columns', () => {
    const overridden = colorwayNecklace.variants.find((v) => v.priceSet)
    expect(overridden).toBeDefined()
    const created = toVariantCreate(overridden!)
    expect(created.priceNgnMinor).toBe(overridden!.priceSet!.ngn.amountMinor)
    expect(created.priceUsdMinor).toBe(overridden!.priceSet!.usd.amountMinor)
  })

  it('maps an absent variant price override to null (inherit product price)', () => {
    const notOverridden = colorwayNecklace.variants.find((v) => !v.priceSet)
    expect(notOverridden).toBeDefined()
    const created = toVariantCreate(notOverridden!)
    expect(created.priceNgnMinor).toBeNull()
    expect(created.priceUsdMinor).toBeNull()
  })
})

describe('toOptionTypesCreate / toProductCreate — option type + value ordering', () => {
  it('preserves authored, non-alphabetical order for Color: Turquoise|Coral|Ivory', () => {
    expect(colorwayNecklace.optionTypes).toEqual([{ name: 'Color', values: ['Turquoise', 'Coral', 'Ivory'] }])
    const rows = toOptionTypesCreate(colorwayNecklace.optionTypes)
    expect(rows).toHaveLength(1)
    expect(rows[0].name).toBe('Color')
    expect(rows[0].position).toBe(0)
    expect(rows[0].values).toEqual({
      create: [
        { value: 'Turquoise', position: 0 },
        { value: 'Coral', position: 1 },
        { value: 'Ivory', position: 2 },
      ],
    })
    // Explicitly assert this is NOT alphabetised (alphabetical would be Coral, Ivory, Turquoise).
    const orderedValues = rows[0].values.create.map((v) => v.value)
    expect(orderedValues).not.toEqual([...orderedValues].sort())
    expect(orderedValues).toEqual(['Turquoise', 'Coral', 'Ivory'])
  })

  it('preserves authored, non-alphabetical order for Size: S|M|L|XL', () => {
    expect(waistBeads.optionTypes).toEqual([{ name: 'Size', values: ['S', 'M', 'L', 'XL'] }])
    const rows = toOptionTypesCreate(waistBeads.optionTypes)
    expect(rows[0].values).toEqual({
      create: [
        { value: 'S', position: 0 },
        { value: 'M', position: 1 },
        { value: 'L', position: 2 },
        { value: 'XL', position: 3 },
      ],
    })
  })

  it('preserves order across multiple option types via position', () => {
    const rows = toOptionTypesCreate([
      { name: 'Color', values: ['Turquoise', 'Coral', 'Ivory'] },
      { name: 'Size', values: ['S', 'M', 'L', 'XL'] },
    ])
    expect(rows.map((r) => ({ name: r.name, position: r.position }))).toEqual([
      { name: 'Color', position: 0 },
      { name: 'Size', position: 1 },
    ])
  })

  it('yields an empty optionTypes array for a product without options', () => {
    const result = toProductCreate(minimalProduct, categoryIdBySlug, subcategoryIdByKey)
    expect(result.optionTypes).toEqual({ create: [] })
  })
})

describe('toImageCreate / toProductCreate — image position', () => {
  it('maps a single image with position equal to its index', () => {
    const image = { src: 'https://example.com/x.jpg', alt: 'x' }
    expect(toImageCreate(image, 0)).toEqual({ src: image.src, alt: image.alt, position: 0 })
    expect(toImageCreate(image, 2)).toEqual({ src: image.src, alt: image.alt, position: 2 })
  })

  it('maps a product images array with deterministic position equal to index', () => {
    expect(seoProduct.images.length).toBeGreaterThan(1)
    const result = toProductCreate(seoProduct, categoryIdBySlug, subcategoryIdByKey)
    expect(result.images).toEqual({
      create: seoProduct.images.map((img, i) => ({ src: img.src, alt: img.alt, position: i })),
    })
  })
})

describe('toBadges — badge enum mapping', () => {
  it("maps 'new' to Badge.NEW", () => {
    expect(toBadges(['new'])).toEqual(['NEW'])
  })

  it("maps 'best-seller' to Badge.BEST_SELLER", () => {
    expect(toBadges(['best-seller'])).toEqual(['BEST_SELLER'])
  })

  it('maps a real new-badged product (Color necklace)', () => {
    expect(colorwayNecklace.badges).toEqual(['new'])
    const result = toProductCreate(colorwayNecklace, categoryIdBySlug, subcategoryIdByKey)
    expect(result.badges).toEqual(['NEW'])
  })

  it('maps a real best-seller-badged product (waist beads)', () => {
    expect(waistBeads.badges).toEqual(['best-seller'])
    const result = toProductCreate(waistBeads, categoryIdBySlug, subcategoryIdByKey)
    expect(result.badges).toEqual(['BEST_SELLER'])
  })

  it('maps an empty badges array to an empty array', () => {
    const result = toProductCreate(minimalProduct, categoryIdBySlug, subcategoryIdByKey)
    expect(result.badges).toEqual([])
  })
})

describe('toProductCreate — subcategory connection', () => {
  it('resolves a subcategory id when subcategorySlug is present', () => {
    const result = toProductCreate(waistBeads, categoryIdBySlug, subcategoryIdByKey)
    expect(result.subcategoryId).toBe('sub_waistbeads_id')
  })

  it('yields no subcategory connection when subcategorySlug is absent', () => {
    expect(minimalProduct.subcategorySlug).toBeUndefined()
    const result = toProductCreate(minimalProduct, categoryIdBySlug, subcategoryIdByKey)
    expect(result.subcategoryId ?? null).toBeNull()
  })

  it('resolves the category id from categoryIdBySlug', () => {
    const result = toProductCreate(minimalProduct, categoryIdBySlug, subcategoryIdByKey)
    expect(result.categoryId).toBe('cat_jewelry_id')
  })
})

describe('toProductCreate / toVariantCreate — authored id parity (Phase 5a)', () => {
  it('carries the authored product id through — identity parity for Phase 5a', () => {
    const real = getAllProducts()[0]
    const row = toProductCreate(real, categoryIdBySlug, subcategoryIdByKey)
    expect(row.id).toBe(real.id)
  })

  it('carries the authored variant id through — identity parity for Phase 5a', () => {
    const variantProduct = getAllProducts().find((p) => p.variants.length > 0)!
    const row = toVariantCreate(variantProduct.variants[0])
    expect(row.id).toBe(variantProduct.variants[0].id)
  })
})

describe('toProductCreate — SEO fields', () => {
  it('maps seo.title/seo.description to seoTitle/seoDescription', () => {
    expect(seoProduct.seo.title).toBeTruthy()
    expect(seoProduct.seo.description).toBeTruthy()
    const result = toProductCreate(seoProduct, categoryIdBySlug, subcategoryIdByKey)
    expect(result.seoTitle).toBe(seoProduct.seo.title)
    expect(result.seoDescription).toBe(seoProduct.seo.description)
  })

  it('maps an absent seo.title/description to null', () => {
    const result = toProductCreate(minimalProduct, categoryIdBySlug, subcategoryIdByKey)
    expect(result.seoTitle).toBeNull()
    expect(result.seoDescription).toBeNull()
  })
})
