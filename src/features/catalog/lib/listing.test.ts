import { describe, it, expect } from 'vitest'
import { filterAndSortProducts, parseListingParams } from '@/features/catalog/lib/listing'
import type { Product } from '@/types/catalog'

/** Builds a minimal Product-shaped fixture with a distinct NGN price. */
function makeProduct(overrides: Partial<Product> & { id: string; ngn: number }): Product {
  const { ngn, id, ...rest } = overrides
  return {
    id,
    name: `Product ${id}`,
    slug: `product-${id}`,
    shortDescription: 'A lovely piece.',
    description: 'A lovely piece, described in full.',
    priceSet: {
      ngn: { amountMinor: ngn * 100, currency: 'NGN' },
      usd: { amountMinor: Math.round((ngn * 100) / 1600), currency: 'USD' },
    },
    sku: `SKU-${overrides.id}`,
    inventory: 10,
    material: 'Gold',
    materialTags: ['Gold-plated'],
    categorySlug: 'jewelry',
    subcategorySlug: 'necklaces',
    collectionSlugs: [],
    images: [{ src: '/img.jpg', alt: 'img' }],
    optionTypes: [],
    variants: [],
    badges: [],
    status: 'active',
    seo: {},
    ...rest,
  }
}

const cheap = makeProduct({ id: '1', ngn: 5_000 })
const mid = makeProduct({ id: '2', ngn: 15_000 })
const pricey = makeProduct({ id: '3', ngn: 30_000 })
const bracelet = makeProduct({ id: '4', ngn: 20_000, subcategorySlug: 'bracelets' })

const all = [pricey, cheap, bracelet, mid]

describe('filterAndSortProducts', () => {
  it('sorts by price ascending using the authored NGN price', () => {
    const result = filterAndSortProducts(all, { sort: 'price-asc' })
    expect(result.map((p) => p.id)).toEqual(['1', '2', '4', '3'])
  })

  it('sorts by price descending using the authored NGN price', () => {
    const result = filterAndSortProducts(all, { sort: 'price-desc' })
    expect(result.map((p) => p.id)).toEqual(['3', '4', '2', '1'])
  })

  it('keeps stable input order for "newest" (default)', () => {
    const result = filterAndSortProducts(all, { sort: 'newest' })
    expect(result.map((p) => p.id)).toEqual(['3', '1', '4', '2'])

    const withoutSort = filterAndSortProducts(all)
    expect(withoutSort.map((p) => p.id)).toEqual(['3', '1', '4', '2'])
  })

  it('filters by inclusive priceMin/priceMax bounds given in NGN major units', () => {
    // 15,000 and 20,000 authored; bounds are inclusive at both ends.
    const result = filterAndSortProducts(all, { priceMin: 15_000, priceMax: 20_000, sort: 'price-asc' })
    expect(result.map((p) => p.id)).toEqual(['2', '4'])
  })

  it('filters to products at exactly priceMin or exactly priceMax', () => {
    const atMin = filterAndSortProducts(all, { priceMin: 5_000, priceMax: 5_000 })
    expect(atMin.map((p) => p.id)).toEqual(['1'])

    const atMax = filterAndSortProducts(all, { priceMin: 30_000, priceMax: 30_000 })
    expect(atMax.map((p) => p.id)).toEqual(['3'])
  })

  it('handles fractional NGN price bounds without float-rounding error (inclusive)', () => {
    // A product priced at exactly ₦19.99 = 1999 minor units.
    const at1999: Product = {
      ...makeProduct({ id: '9', ngn: 0 }),
      priceSet: {
        ngn: { amountMinor: 1999, currency: 'NGN' },
        usd: { amountMinor: 125, currency: 'USD' },
      },
    }
    // 19.99 * 100 === 1998.9999999999998 in float; Math.round keeps the bound inclusive.
    expect(filterAndSortProducts([at1999], { priceMax: 19.99 }).map((p) => p.id)).toEqual(['9'])
    expect(filterAndSortProducts([at1999], { priceMin: 19.99 }).map((p) => p.id)).toEqual(['9'])
  })

  it('filters by subcategory', () => {
    const result = filterAndSortProducts(all, { subcategory: 'bracelets' })
    expect(result.map((p) => p.id)).toEqual(['4'])
  })

  it('combines subcategory filter with price sort', () => {
    const withBraceletB = makeProduct({ id: '5', ngn: 8_000, subcategorySlug: 'bracelets' })
    const result = filterAndSortProducts([...all, withBraceletB], {
      subcategory: 'bracelets',
      sort: 'price-asc',
    })
    expect(result.map((p) => p.id)).toEqual(['5', '4'])
  })
})

describe('parseListingParams', () => {
  it('parses a full valid set of URL searchParams', () => {
    expect(
      parseListingParams({ sort: 'price-asc', priceMin: '1000', priceMax: '5000', subcategory: 'bracelets' }),
    ).toEqual({ sort: 'price-asc', priceMin: 1000, priceMax: 5000, subcategory: 'bracelets' })
  })

  it('returns all-undefined for an empty searchParams object', () => {
    expect(parseListingParams({})).toEqual({
      sort: undefined,
      priceMin: undefined,
      priceMax: undefined,
      subcategory: undefined,
    })
  })

  it('drops an unrecognized sort value rather than passing it through', () => {
    expect(parseListingParams({ sort: 'oldest' }).sort).toBeUndefined()
  })

  it('drops a non-numeric price value rather than passing NaN through', () => {
    const result = parseListingParams({ priceMin: 'abc', priceMax: '' })
    expect(result.priceMin).toBeUndefined()
    expect(result.priceMax).toBeUndefined()
  })

  it('treats an empty subcategory string as absent', () => {
    expect(parseListingParams({ subcategory: '' }).subcategory).toBeUndefined()
  })
})
