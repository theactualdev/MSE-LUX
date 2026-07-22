import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CategoryRowForMapping, CollectionRowForMapping, ProductRowForMapping } from './mapper'

const product = { findMany: vi.fn() }
const category = { findMany: vi.fn() }
const collection = { findMany: vi.fn() }

vi.mock('@/lib/db', () => ({
  db: {
    get product() {
      return product
    },
    get category() {
      return category
    },
    get collection() {
      return collection
    },
  },
}))

const sel = await import('./selectors')

function productRow(overrides: Partial<ProductRowForMapping> & Pick<ProductRowForMapping, 'id' | 'slug'>): ProductRowForMapping {
  return {
    sku: `SKU-${overrides.id}`,
    name: overrides.id,
    shortDescription: 'Short',
    description: 'Long',
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
    ...overrides,
  }
}

// Five products spanning three categories and one shared collection, deliberately shaped so
// getRelatedProducts exercises both the same-category and shared-collection-fallback branches.
const P1 = productRow({
  id: 'PROD-1',
  slug: 'p1',
  category: { slug: 'jewelry' },
  subcategory: { slug: 'necklaces' },
  collections: [{ position: 0, collection: { slug: 'bridal' } }],
})
const P2 = productRow({
  id: 'PROD-2',
  slug: 'p2',
  category: { slug: 'jewelry' },
  subcategory: { slug: 'earrings' },
  badges: ['BEST_SELLER'],
})
const P3 = productRow({
  id: 'PROD-3',
  slug: 'p3',
  category: { slug: 'jewelry' },
  subcategory: { slug: 'rings' },
  badges: ['NEW'],
})
const P4 = productRow({
  id: 'PROD-4',
  slug: 'p4',
  category: { slug: 'beads' },
  subcategory: { slug: 'loose-beads' },
  collections: [{ position: 0, collection: { slug: 'bridal' } }],
})
const P5 = productRow({
  id: 'PROD-5',
  slug: 'p5',
  category: { slug: 'accessories' },
  subcategory: { slug: 'bags' },
})

const CATEGORY_ROWS: CategoryRowForMapping[] = [
  {
    slug: 'jewelry',
    name: 'Jewelry',
    description: null,
    image: null,
    subcategories: [
      { slug: 'necklaces', name: 'Necklaces' },
      { slug: 'earrings', name: 'Earrings' },
      { slug: 'rings', name: 'Rings' },
    ],
  },
  {
    slug: 'beads',
    name: 'Beads',
    description: null,
    image: null,
    subcategories: [{ slug: 'loose-beads', name: 'Loose Beads' }],
  },
  {
    slug: 'accessories',
    name: 'Accessories',
    description: null,
    image: null,
    subcategories: [{ slug: 'bags', name: 'Bags' }],
  },
]

const COLLECTION_ROWS: CollectionRowForMapping[] = [
  {
    slug: 'bridal',
    name: 'Bridal',
    description: null,
    image: null,
    products: [
      { position: 0, product: { slug: 'p1' } },
      { position: 1, product: { slug: 'p4' } },
    ],
  },
]

beforeEach(() => {
  vi.clearAllMocks()
  product.findMany.mockResolvedValue([P1, P2, P3, P4, P5])
  category.findMany.mockResolvedValue(CATEGORY_ROWS)
  collection.findMany.mockResolvedValue(COLLECTION_ROWS)
})

describe('getAllProducts / getProductBySlug', () => {
  it('finds a product by slug', async () => {
    await expect(sel.getProductBySlug('p2')).resolves.toEqual(expect.objectContaining({ slug: 'p2' }))
    await expect(sel.getProductBySlug('does-not-exist')).resolves.toBeUndefined()
  })
})

describe('getProductsByCategory / getProductsBySubcategory', () => {
  it('filters by category', async () => {
    const jewelry = await sel.getProductsByCategory('jewelry')
    expect(jewelry.map((p) => p.slug)).toEqual(['p1', 'p2', 'p3'])
  })

  it('filters by category and subcategory', async () => {
    const earrings = await sel.getProductsBySubcategory('jewelry', 'earrings')
    expect(earrings.map((p) => p.slug)).toEqual(['p2'])
  })
})

describe('getBestSellers / getNewArrivals — badge filter', () => {
  it('getBestSellers returns only best-seller-badged products', async () => {
    const bestSellers = await sel.getBestSellers()
    expect(bestSellers.map((p) => p.slug)).toEqual(['p2'])
    expect(bestSellers.every((p) => p.badges.includes('best-seller'))).toBe(true)
  })

  it('getNewArrivals returns only new-badged products', async () => {
    const newArrivals = await sel.getNewArrivals()
    expect(newArrivals.map((p) => p.slug)).toEqual(['p3'])
    expect(newArrivals.every((p) => p.badges.includes('new'))).toBe(true)
  })
})

describe('getRelatedProducts — same-category-first, shared-collection fallback, self-exclusion, limit', () => {
  it('returns same-category matches when there are enough of them, excluding the source product', async () => {
    const p1 = await sel.getProductBySlug('p1')
    const related = await sel.getRelatedProducts(p1!, 2)

    expect(related.map((p) => p.slug)).toEqual(['p2', 'p3'])
    expect(related.find((p) => p.id === p1!.id)).toBeUndefined()
  })

  it('falls back to shared-collection products once same-category is exhausted', async () => {
    const p1 = await sel.getProductBySlug('p1')
    const related = await sel.getRelatedProducts(p1!, 3)

    // p2, p3: same category (jewelry). p4: different category but shares the 'bridal'
    // collection with p1. p5: neither same category nor a shared collection — excluded.
    expect(related.map((p) => p.slug)).toEqual(['p2', 'p3', 'p4'])
  })

  it('respects the limit', async () => {
    const p1 = await sel.getProductBySlug('p1')
    const related = await sel.getRelatedProducts(p1!, 1)

    expect(related).toHaveLength(1)
    expect(related[0].slug).toBe('p2')
  })
})

describe('categories', () => {
  it('resolves a category and its subcategory', async () => {
    await expect(sel.getCategoryBySlug('jewelry')).resolves.toEqual(
      expect.objectContaining({ slug: 'jewelry' }),
    )
    await expect(sel.getSubcategory('jewelry', 'earrings')).resolves.toEqual(
      expect.objectContaining({ slug: 'earrings', categorySlug: 'jewelry' }),
    )
    await expect(sel.getSubcategory('jewelry', 'does-not-exist')).resolves.toBeUndefined()
    await expect(sel.getCategoryBySlug('does-not-exist')).resolves.toBeUndefined()
  })

  it('getAllCategories returns every category', async () => {
    const categories = await sel.getAllCategories()
    expect(categories.map((c) => c.slug)).toEqual(['jewelry', 'beads', 'accessories'])
  })
})

describe('collections', () => {
  it('resolves a collection and its products', async () => {
    const c = await sel.getCollectionBySlug('bridal')
    expect(c).toEqual(expect.objectContaining({ slug: 'bridal' }))

    const productsInCollection = await sel.getProductsInCollection('bridal')
    expect(productsInCollection.map((p) => p.slug)).toEqual(['p1', 'p4'])
    expect(productsInCollection.every((p) => p.collectionSlugs.includes('bridal'))).toBe(true)
  })

  it('getAllCollections returns every collection', async () => {
    const collections = await sel.getAllCollections()
    expect(collections.map((c) => c.slug)).toEqual(['bridal'])
  })
})

describe('per-request caching', () => {
  // The plain `react` package (as resolved in this Vitest/jsdom environment, not Next's
  // `react-server` build) implements `cache()` as an identity passthrough — it has no
  // request-scoping to piggyback on outside of an actual React Server render. To exercise the
  // per-request-dedup *contract* `loadCatalog` relies on, this test substitutes a real
  // memoizing `cache()` for the duration of a single, freshly-loaded module graph, then asserts
  // that two different selectors calling into `loadCatalog` only trigger one underlying query.
  it('two different selectors calling loadCatalog only query the database once', async () => {
    vi.resetModules()
    vi.doMock('react', async (importOriginal) => {
      const actual = await importOriginal<typeof import('react')>()
      return {
        ...actual,
        cache<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
          let hasRun = false
          let result: R
          return (...args: A) => {
            if (!hasRun) {
              hasRun = true
              result = fn(...args)
            }
            return result
          }
        },
      }
    })

    try {
      const fresh = await import('./selectors')
      product.findMany.mockResolvedValue([P1, P2, P3, P4, P5])
      category.findMany.mockResolvedValue(CATEGORY_ROWS)
      collection.findMany.mockResolvedValue(COLLECTION_ROWS)

      await fresh.getAllProducts()
      await fresh.getBestSellers()

      expect(product.findMany).toHaveBeenCalledTimes(1)
      expect(category.findMany).toHaveBeenCalledTimes(1)
      expect(collection.findMany).toHaveBeenCalledTimes(1)
    } finally {
      vi.doUnmock('react')
      vi.resetModules()
    }
  })
})
