import { beforeEach, describe, expect, it, vi } from 'vitest'

const product = { findMany: vi.fn(), count: vi.fn(), findUnique: vi.fn() }
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

const { listCatalogProducts, getCatalogProduct, listTaxonomy, listCollectionsWithCounts, CATALOG_PAGE_SIZE } = await import(
  '@/features/admin/catalog/data'
)

beforeEach(() => {
  vi.clearAllMocks()
  product.findMany.mockResolvedValue([])
  product.count.mockResolvedValue(0)
  product.findUnique.mockResolvedValue(null)
  category.findMany.mockResolvedValue([])
  collection.findMany.mockResolvedValue([])
})

const LIST_SELECT = {
  id: true,
  name: true,
  slug: true,
  sku: true,
  status: true,
  priceNgnMinor: true,
  priceUsdMinor: true,
  inventory: true,
  category: { select: { name: true } },
  images: { orderBy: { position: 'asc' }, take: 1, select: { src: true } },
  variants: { select: { inventory: true } },
}

describe('listCatalogProducts', () => {
  it('pages by exactly 20 rows (the CATALOG_PAGE_SIZE contract the symbolic assertions below rely on)', () => {
    expect(CATALOG_PAGE_SIZE).toBe(20)
  })

  it('returns empty list when no products exist', async () => {
    const result = await listCatalogProducts({})

    expect(result).toEqual({ products: [], total: 0, page: 1, pageCount: 1 })
  })

  it('fetches with default pagination (page 1, size 20), no filters, newest-first sort', async () => {
    await listCatalogProducts({})

    expect(product.findMany).toHaveBeenCalledWith({
      where: {},
      orderBy: { createdAt: 'desc' },
      skip: 0,
      take: CATALOG_PAGE_SIZE,
      select: LIST_SELECT,
    })
    expect(product.count).toHaveBeenCalledWith({ where: {} })
  })

  it('maps a variantless product: stock = own inventory, variantCount = 0, heroImage from first image', async () => {
    product.findMany.mockResolvedValue([
      {
        id: 'p1',
        name: 'Gold Ring',
        slug: 'gold-ring',
        sku: 'RING-1',
        status: 'ACTIVE',
        priceNgnMinor: 500000,
        priceUsdMinor: 30000,
        inventory: 7,
        category: { name: 'Rings' },
        images: [{ src: '/images/ring.jpg' }],
        variants: [],
      },
    ])
    product.count.mockResolvedValue(1)

    const result = await listCatalogProducts({})

    expect(result.products[0]).toEqual({
      id: 'p1',
      name: 'Gold Ring',
      slug: 'gold-ring',
      sku: 'RING-1',
      status: 'ACTIVE',
      priceNgnMinor: 500000,
      priceUsdMinor: 30000,
      stock: 7,
      variantCount: 0,
      categoryName: 'Rings',
      heroImage: '/images/ring.jpg',
    })
  })

  it('maps a variant product: stock = sum of variant inventory, ignoring own inventory column', async () => {
    product.findMany.mockResolvedValue([
      {
        id: 'p2',
        name: 'Necklace',
        slug: 'necklace',
        sku: 'NECK-1',
        status: 'ACTIVE',
        priceNgnMinor: 800000,
        priceUsdMinor: 45000,
        inventory: 0,
        category: { name: 'Necklaces' },
        images: [],
        variants: [{ inventory: 3 }, { inventory: 5 }],
      },
    ])
    product.count.mockResolvedValue(1)

    const result = await listCatalogProducts({})

    expect(result.products[0].stock).toBe(8)
    expect(result.products[0].variantCount).toBe(2)
    expect(result.products[0].heroImage).toBeNull()
  })

  it('searches: trims, builds OR over name-contains-insensitive/sku-exact/slug-exact', async () => {
    await listCatalogProducts({ search: ' ring ' })

    expect(product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [{ name: { contains: 'ring', mode: 'insensitive' } }, { sku: 'ring' }, { slug: 'ring' }],
        },
      }),
    )
    expect(product.count).toHaveBeenCalledWith({
      where: {
        OR: [{ name: { contains: 'ring', mode: 'insensitive' } }, { sku: 'ring' }, { slug: 'ring' }],
      },
    })
  })

  it('filters by status alone', async () => {
    await listCatalogProducts({ status: 'DRAFT' })

    expect(product.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { status: 'DRAFT' } }))
  })

  it('filters by categoryId alone', async () => {
    await listCatalogProducts({ categoryId: 'cat-1' })

    expect(product.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { categoryId: 'cat-1' } }))
  })

  it('combines search + status + categoryId with AND', async () => {
    await listCatalogProducts({ search: 'ring', status: 'ACTIVE', categoryId: 'cat-1' })

    expect(product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            { OR: [{ name: { contains: 'ring', mode: 'insensitive' } }, { sku: 'ring' }, { slug: 'ring' }] },
            { status: 'ACTIVE' },
            { categoryId: 'cat-1' },
          ],
        },
      }),
    )
  })

  it("sort: 'low-stock' orders by the product's own inventory column ascending", async () => {
    await listCatalogProducts({ sort: 'low-stock' })

    expect(product.findMany).toHaveBeenCalledWith(expect.objectContaining({ orderBy: { inventory: 'asc' } }))
  })

  it("sort: 'newest' (and default) orders by createdAt descending", async () => {
    await listCatalogProducts({ sort: 'newest' })
    expect(product.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ orderBy: { createdAt: 'desc' } }))

    await listCatalogProducts({})
    expect(product.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ orderBy: { createdAt: 'desc' } }))
  })

  it('handles pagination: page 1 skip 0, page 2 skip CATALOG_PAGE_SIZE, page 3 skip 2*CATALOG_PAGE_SIZE', async () => {
    product.count.mockResolvedValue(100)

    await listCatalogProducts({ page: 1 })
    expect(product.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ skip: 0 }))

    await listCatalogProducts({ page: 2 })
    expect(product.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ skip: CATALOG_PAGE_SIZE }))

    await listCatalogProducts({ page: 3 })
    expect(product.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ skip: 2 * CATALOG_PAGE_SIZE }))
  })

  it('floor-clamps a fractional page to a minimum-1 integer', async () => {
    product.count.mockResolvedValue(100)

    await listCatalogProducts({ page: 2.9 })
    expect(product.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ skip: CATALOG_PAGE_SIZE }))
    let result = await listCatalogProducts({ page: 2.9 })
    expect(result.page).toBe(2)

    await listCatalogProducts({ page: 0 })
    expect(product.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ skip: 0 }))

    result = await listCatalogProducts({ page: -5 })
    expect(result.page).toBe(1)
    expect(product.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ skip: 0 }))
  })

  it('calculates pageCount correctly, clamped to a minimum of 1', async () => {
    product.count.mockResolvedValue(0)
    let result = await listCatalogProducts({})
    expect(result.pageCount).toBe(1)

    product.count.mockResolvedValue(CATALOG_PAGE_SIZE)
    result = await listCatalogProducts({})
    expect(result.pageCount).toBe(1)

    product.count.mockResolvedValue(CATALOG_PAGE_SIZE + 1)
    result = await listCatalogProducts({})
    expect(result.pageCount).toBe(2)

    product.count.mockResolvedValue(100)
    result = await listCatalogProducts({})
    expect(result.pageCount).toBe(5)
  })
})

describe('getCatalogProduct', () => {
  const DETAIL_INCLUDE = {
    images: { orderBy: { position: 'asc' } },
    optionTypes: { orderBy: { position: 'asc' }, include: { values: { orderBy: { position: 'asc' } } } },
    variants: { include: { options: { select: { name: true, value: true } } } },
    collections: { select: { collectionId: true } },
    orderLines: { take: 1, select: { id: true } },
  }

  it('returns null when product not found', async () => {
    product.findUnique.mockResolvedValue(null)

    const result = await getCatalogProduct('missing-id')

    expect(result).toBeNull()
    expect(product.findUnique).toHaveBeenCalledWith({ where: { id: 'missing-id' }, include: DETAIL_INCLUDE })
  })

  it('maps the full detail shape, including hasOrderLines: true when orderLines is non-empty', async () => {
    product.findUnique.mockResolvedValue({
      id: 'p1',
      name: 'Gold Ring',
      slug: 'gold-ring',
      sku: 'RING-1',
      shortDescription: 'A ring',
      description: 'A very nice ring',
      material: 'Gold',
      materialTags: ['gold', '18k'],
      badges: ['NEW'],
      status: 'ACTIVE',
      priceNgnMinor: 500000,
      priceUsdMinor: 30000,
      salePriceNgnMinor: 450000,
      salePriceUsdMinor: 27000,
      inventory: 7,
      weightGrams: 12,
      seoTitle: 'Gold Ring | MSE Lux',
      seoDescription: 'Buy a gold ring',
      categoryId: 'cat-1',
      subcategoryId: 'sub-1',
      collections: [{ collectionId: 'col-1' }, { collectionId: 'col-2' }],
      images: [
        { id: 'img-1', src: '/a.jpg', alt: 'A', position: 0 },
        { id: 'img-2', src: '/b.jpg', alt: 'B', position: 1 },
      ],
      optionTypes: [
        {
          id: 'opt-1',
          name: 'Size',
          position: 0,
          values: [
            { id: 'val-1', value: '7', position: 0 },
            { id: 'val-2', value: '8', position: 1 },
          ],
        },
      ],
      variants: [
        {
          id: 'var-1',
          sku: 'RING-1-S7',
          inventory: 4,
          priceNgnMinor: null,
          priceUsdMinor: null,
          options: [{ name: 'Size', value: '7' }],
        },
      ],
      orderLines: [{ id: 'line-1' }],
    })

    const result = await getCatalogProduct('p1')

    expect(result).toEqual({
      id: 'p1',
      name: 'Gold Ring',
      slug: 'gold-ring',
      sku: 'RING-1',
      shortDescription: 'A ring',
      description: 'A very nice ring',
      material: 'Gold',
      materialTags: ['gold', '18k'],
      badges: ['NEW'],
      status: 'ACTIVE',
      priceNgnMinor: 500000,
      priceUsdMinor: 30000,
      salePriceNgnMinor: 450000,
      salePriceUsdMinor: 27000,
      inventory: 7,
      weightGrams: 12,
      seoTitle: 'Gold Ring | MSE Lux',
      seoDescription: 'Buy a gold ring',
      categoryId: 'cat-1',
      subcategoryId: 'sub-1',
      collectionIds: ['col-1', 'col-2'],
      images: [
        { id: 'img-1', src: '/a.jpg', alt: 'A', position: 0 },
        { id: 'img-2', src: '/b.jpg', alt: 'B', position: 1 },
      ],
      optionTypes: [
        {
          id: 'opt-1',
          name: 'Size',
          position: 0,
          values: [
            { id: 'val-1', value: '7', position: 0 },
            { id: 'val-2', value: '8', position: 1 },
          ],
        },
      ],
      variants: [
        {
          id: 'var-1',
          sku: 'RING-1-S7',
          inventory: 4,
          priceNgnMinor: null,
          priceUsdMinor: null,
          options: [{ name: 'Size', value: '7' }],
        },
      ],
      hasOrderLines: true,
    })
  })

  it('maps hasOrderLines: false when orderLines is empty', async () => {
    product.findUnique.mockResolvedValue({
      id: 'p2',
      name: 'Necklace',
      slug: 'necklace',
      sku: 'NECK-1',
      shortDescription: 'A necklace',
      description: 'A very nice necklace',
      material: 'Silver',
      materialTags: [],
      badges: [],
      status: 'DRAFT',
      priceNgnMinor: 200000,
      priceUsdMinor: 12000,
      salePriceNgnMinor: null,
      salePriceUsdMinor: null,
      inventory: 0,
      weightGrams: null,
      seoTitle: null,
      seoDescription: null,
      categoryId: 'cat-2',
      subcategoryId: null,
      collections: [],
      images: [],
      optionTypes: [],
      variants: [],
      orderLines: [],
    })

    const result = await getCatalogProduct('p2')

    expect(result?.hasOrderLines).toBe(false)
    expect(result?.collectionIds).toEqual([])
    expect(result?.subcategoryId).toBeNull()
  })
})

describe('listTaxonomy', () => {
  it('fetches categories (with ordered subcategories) and collections', async () => {
    category.findMany.mockResolvedValue([
      { id: 'cat-1', name: 'Rings', subcategories: [{ id: 'sub-1', name: 'Engagement' }] },
    ])
    collection.findMany.mockResolvedValue([{ id: 'col-1', name: 'Summer', slug: 'summer' }])

    const result = await listTaxonomy()

    expect(category.findMany).toHaveBeenCalledWith({
      orderBy: { name: 'asc' },
      select: { id: true, name: true, subcategories: { orderBy: { name: 'asc' }, select: { id: true, name: true } } },
    })
    expect(collection.findMany).toHaveBeenCalledWith({
      orderBy: { name: 'asc' },
      select: { id: true, name: true, slug: true },
    })
    expect(result).toEqual({
      categories: [{ id: 'cat-1', name: 'Rings', subcategories: [{ id: 'sub-1', name: 'Engagement' }] }],
      collections: [{ id: 'col-1', name: 'Summer', slug: 'summer' }],
    })
  })
})

describe('listCollectionsWithCounts', () => {
  it('fetches collections ordered by name, with product counts', async () => {
    collection.findMany.mockResolvedValue([
      { id: 'col-1', name: 'Summer', slug: 'summer', description: 'Summer picks', _count: { products: 4 } },
      { id: 'col-2', name: 'Winter', slug: 'winter', description: null, _count: { products: 0 } },
    ])

    const result = await listCollectionsWithCounts()

    expect(collection.findMany).toHaveBeenCalledWith({
      orderBy: { name: 'asc' },
      include: { _count: { select: { products: true } } },
    })
    expect(result).toEqual([
      { id: 'col-1', name: 'Summer', slug: 'summer', description: 'Summer picks', productCount: 4 },
      { id: 'col-2', name: 'Winter', slug: 'winter', description: null, productCount: 0 },
    ])
  })
})
