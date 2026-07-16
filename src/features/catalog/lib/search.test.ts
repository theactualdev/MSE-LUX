import { describe, expect, it } from 'vitest'
import type { Product } from '@/types/catalog'
import type { SearchCriteria } from '@/features/catalog/lib/search-params'
import { computeFacetCounts, searchAndFilterProducts } from '@/features/catalog/lib/search'

const base: SearchCriteria = {
  query: undefined, categories: [], subcategory: undefined, materials: [], colors: [],
  badges: [], priceMin: undefined, priceMax: undefined, inStock: false, sort: 'newest',
}

function p(partial: Partial<Product>): Product {
  return {
    id: partial.slug ?? 'x', name: '', slug: 'x', shortDescription: '', description: '',
    priceSet: { ngn: { amountMinor: 1000, currency: 'NGN' }, usd: { amountMinor: 100, currency: 'USD' } },
    sku: 'x', inventory: 5, material: '', materialTags: [], categorySlug: 'jewelry',
    collectionSlugs: [], images: [], optionTypes: [], variants: [], badges: [],
    status: 'active', seo: {}, ...partial,
  }
}

const FIXTURE: Product[] = [
  p({ slug: 'a', name: 'Cowrie Choker', categorySlug: 'jewelry', materialTags: ['Cowrie shell', 'Brass'],
      optionTypes: [{ name: 'Color', values: ['Gold'] }],
      priceSet: { ngn: { amountMinor: 900000, currency: 'NGN' }, usd: { amountMinor: 9000, currency: 'USD' } }, badges: ['new'] }),
  p({ slug: 'b', name: 'Brass Hoops', categorySlug: 'jewelry', materialTags: ['Brass'],
      optionTypes: [{ name: 'Color', values: ['Gold', 'Silver'] }],
      priceSet: { ngn: { amountMinor: 500000, currency: 'NGN' }, usd: { amountMinor: 5000, currency: 'USD' } }, inventory: 0, badges: ['best-seller'] }),
  p({ slug: 'c', name: 'Glass Bead Strand', categorySlug: 'beads', materialTags: ['Recycled glass'],
      priceSet: { ngn: { amountMinor: 200000, currency: 'NGN' }, usd: { amountMinor: 2000, currency: 'USD' } } }),
]

describe('searchAndFilterProducts', () => {
  it('empty criteria returns all in input order', () => {
    expect(searchAndFilterProducts(FIXTURE, base).map((x) => x.slug)).toEqual(['a', 'b', 'c'])
  })
  it('query matches name / material tags (case-insensitive)', () => {
    expect(searchAndFilterProducts(FIXTURE, { ...base, query: 'brass' }).map((x) => x.slug)).toEqual(['a', 'b'])
  })
  it('material facet (OR within), color facet, and AND across facets', () => {
    expect(searchAndFilterProducts(FIXTURE, { ...base, materials: ['Brass', 'Recycled glass'] }).map((x) => x.slug)).toEqual(['a', 'b', 'c'])
    expect(searchAndFilterProducts(FIXTURE, { ...base, materials: ['Brass'], colors: ['Silver'] }).map((x) => x.slug)).toEqual(['b'])
  })
  it('category, price bounds, in-stock, badges', () => {
    expect(searchAndFilterProducts(FIXTURE, { ...base, categories: ['beads'] }).map((x) => x.slug)).toEqual(['c'])
    expect(searchAndFilterProducts(FIXTURE, { ...base, priceMin: 3000, priceMax: 6000 }).map((x) => x.slug)).toEqual(['b']) // NGN major units
    expect(searchAndFilterProducts(FIXTURE, { ...base, inStock: true }).map((x) => x.slug)).toEqual(['a', 'c']) // b out of stock
    expect(searchAndFilterProducts(FIXTURE, { ...base, badges: ['new'] }).map((x) => x.slug)).toEqual(['a'])
  })
  it('sort price-asc / price-desc by authored NGN', () => {
    expect(searchAndFilterProducts(FIXTURE, { ...base, sort: 'price-asc' }).map((x) => x.slug)).toEqual(['c', 'b', 'a'])
    expect(searchAndFilterProducts(FIXTURE, { ...base, sort: 'price-desc' }).map((x) => x.slug)).toEqual(['a', 'b', 'c'])
  })
  it('no matches returns empty', () => {
    expect(searchAndFilterProducts(FIXTURE, { ...base, query: 'zzz' })).toEqual([])
  })
})

describe('computeFacetCounts', () => {
  it('counts ignore the dimension\'s own selection but respect others', () => {
    const counts = computeFacetCounts(FIXTURE, { ...base, materials: ['Brass'] })
    // materials counts computed as if no material selected (respect other facets = none here)
    expect(counts.materials['Brass']).toBe(2)
    expect(counts.materials['Recycled glass']).toBe(1)
    // categories respect the active material 'Brass' → only a,b (both jewelry)
    expect(counts.categories['jewelry']).toBe(2)
    expect(counts.categories['beads'] ?? 0).toBe(0)
  })
})
