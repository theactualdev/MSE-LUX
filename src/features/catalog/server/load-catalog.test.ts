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

const { loadCatalog } = await import('./load-catalog')

const baseProductRow: ProductRowForMapping = {
  id: 'PROD-1',
  slug: 'product-one',
  sku: 'SKU-1',
  name: 'Product One',
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
}

function categoryRow(slug: string, subcategorySlugs: string[] = []): CategoryRowForMapping {
  return {
    slug,
    name: slug,
    description: null,
    image: null,
    subcategories: subcategorySlugs.map((s) => ({ slug: s, name: s })),
  }
}

function collectionRow(slug: string): CollectionRowForMapping {
  return { slug, name: slug, description: null, image: null }
}

beforeEach(() => {
  vi.clearAllMocks()
  product.findMany.mockResolvedValue([baseProductRow])
  category.findMany.mockResolvedValue([categoryRow('jewelry'), categoryRow('beads'), categoryRow('accessories')])
  collection.findMany.mockResolvedValue([collectionRow('bridal'), collectionRow('everyday'), collectionRow('statement')])
})

describe('loadCatalog — Prisma query shape', () => {
  it('queries products with status: ACTIVE and the exact orderBy/include shape (no-DRAFT-leakage regression)', async () => {
    await loadCatalog()

    expect(product.findMany).toHaveBeenCalledWith({
      where: { status: 'ACTIVE' },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      include: {
        category: { select: { slug: true } },
        subcategory: { select: { slug: true } },
        images: { orderBy: { position: 'asc' } },
        optionTypes: { orderBy: { position: 'asc' }, include: { values: { orderBy: { position: 'asc' } } } },
        variants: { orderBy: { id: 'asc' }, include: { options: true } },
        collections: { orderBy: { position: 'asc' }, include: { collection: { select: { slug: true } } } },
      },
    })
  })

  it('queries categories with their subcategories and no orderBy (no position/createdAt column to sort by)', async () => {
    await loadCatalog()

    expect(category.findMany).toHaveBeenCalledWith({ include: { subcategories: true } })
  })

  it('queries collections with no include — productSlugs is derived from the products array, not a join', async () => {
    await loadCatalog()

    expect(collection.findMany).toHaveBeenCalledWith()
  })
})

describe('loadCatalog — in-memory taxonomy ordering', () => {
  it('sorts categories into authored order even when the query returns them shuffled', async () => {
    category.findMany.mockResolvedValue([categoryRow('accessories'), categoryRow('jewelry'), categoryRow('beads')])

    const { categories } = await loadCatalog()

    expect(categories.map((c) => c.slug)).toEqual(['jewelry', 'beads', 'accessories'])
  })

  it('sorts a category whose slug is not in the authored order list last, not first', async () => {
    category.findMany.mockResolvedValue([categoryRow('new-arrivals'), categoryRow('beads'), categoryRow('jewelry')])

    const { categories } = await loadCatalog()

    expect(categories.map((c) => c.slug)).toEqual(['jewelry', 'beads', 'new-arrivals'])
  })

  it('sorts each category\'s subcategories into authored order even when shuffled', async () => {
    category.findMany.mockResolvedValue([categoryRow('jewelry', ['rings', 'necklaces', 'earrings'])])

    const { categories } = await loadCatalog()

    expect(categories[0].subcategories.map((s) => s.slug)).toEqual(['necklaces', 'earrings', 'rings'])
  })

  it('sorts collections into authored order even when the query returns them shuffled', async () => {
    collection.findMany.mockResolvedValue([collectionRow('statement'), collectionRow('bridal'), collectionRow('everyday')])

    const { collections } = await loadCatalog()

    expect(collections.map((c) => c.slug)).toEqual(['bridal', 'everyday', 'statement'])
  })

  it('sorts a collection whose slug is not in the authored order list last, not first', async () => {
    collection.findMany.mockResolvedValue([collectionRow('archive'), collectionRow('statement'), collectionRow('bridal')])

    const { collections } = await loadCatalog()

    expect(collections.map((c) => c.slug)).toEqual(['bridal', 'statement', 'archive'])
  })
})

describe('loadCatalog — product mapping', () => {
  it('maps queried product rows through the mapper', async () => {
    const { products } = await loadCatalog()

    expect(products).toEqual([
      expect.objectContaining({ id: 'PROD-1', slug: 'product-one', categorySlug: 'jewelry' }),
    ])
  })
})

describe('loadCatalog — collection productSlugs order (regression: must be global product order, not join position)', () => {
  it("derives a collection's productSlugs from the products array's order, ignoring ProductCollection.position", async () => {
    // Product A is returned by the DB before product B (global product order), but A's own
    // per-product join `position` for this collection (5) is numerically *after* B's (0). If
    // `toDomainCollection` still sorted by that join position, 'bridal' would come out
    // ['b', 'a'] — the fix requires it to come out in product order, ['a', 'b'], instead.
    const productA: ProductRowForMapping = {
      ...baseProductRow,
      id: 'PROD-A',
      slug: 'a',
      collections: [{ position: 5, collection: { slug: 'bridal' } }],
    }
    const productB: ProductRowForMapping = {
      ...baseProductRow,
      id: 'PROD-B',
      slug: 'b',
      collections: [{ position: 0, collection: { slug: 'bridal' } }],
    }
    const productC: ProductRowForMapping = {
      ...baseProductRow,
      id: 'PROD-C',
      slug: 'c',
      collections: [],
    }

    product.findMany.mockResolvedValue([productA, productB, productC])
    collection.findMany.mockResolvedValue([collectionRow('bridal')])

    const { collections } = await loadCatalog()

    const bridal = collections.find((c) => c.slug === 'bridal')
    expect(bridal?.productSlugs).toEqual(['a', 'b'])
  })
})
