import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { Product } from '@/types/catalog'

const getAllProducts = vi.fn()

vi.mock('@/features/catalog/server/selectors', () => ({
  getAllProducts: (...args: unknown[]) => getAllProducts(...args),
}))

const { searchCatalog } = await import('@/features/catalog/search-action')

function product(overrides: Partial<Product> & Pick<Product, 'id' | 'slug' | 'name'>): Product {
  return {
    shortDescription: '',
    description: '',
    priceSet: { ngn: { amountMinor: 100_000, currency: 'NGN' }, usd: { amountMinor: 500, currency: 'USD' } },
    sku: `SKU-${overrides.id}`,
    inventory: 5,
    material: 'Brass',
    materialTags: ['Brass'],
    categorySlug: 'jewelry',
    collectionSlugs: [],
    images: [{ src: `/img/${overrides.slug}.jpg`, alt: overrides.name }],
    optionTypes: [],
    variants: [],
    badges: [],
    status: 'active',
    seo: {},
    ...overrides,
  }
}

const BRASS = product({ id: 'p1', slug: 'brass-pendant', name: 'Brass Pendant Necklace' })
const SILVER = product({ id: 'p2', slug: 'silver-ring', name: 'Silver Ring', material: 'Silver', materialTags: ['Silver'] })

describe('searchCatalog', () => {
  beforeEach(() => {
    getAllProducts.mockReset()
    getAllProducts.mockResolvedValue([BRASS, SILVER])
  })

  it('returns [] for a query under 2 chars without touching the catalog', async () => {
    await expect(searchCatalog('a')).resolves.toEqual([])
    await expect(searchCatalog('  ')).resolves.toEqual([])
    expect(getAllProducts).not.toHaveBeenCalled()
  })

  it('trims and matches against the real catalog, mapped to slim results', async () => {
    const results = await searchCatalog('  brass  ')

    expect(getAllProducts).toHaveBeenCalledTimes(1)
    expect(results).toEqual([
      {
        slug: 'brass-pendant',
        name: 'Brass Pendant Necklace',
        priceSet: BRASS.priceSet,
        image: { src: '/img/brass-pendant.jpg', alt: 'Brass Pendant Necklace' },
      },
    ])
  })

  it('returns [] for a query with no matches', async () => {
    await expect(searchCatalog('zzzznomatch')).resolves.toEqual([])
  })

  it('falls back to a safe blank image when the product has none', async () => {
    getAllProducts.mockResolvedValue([{ ...BRASS, images: [] }])
    const results = await searchCatalog('brass')
    expect(results[0].image).toEqual({ src: '', alt: '' })
  })

  it('slices to at most 8 results', async () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      product({ id: `p${i}`, slug: `brass-${i}`, name: `Brass Item ${i}` }),
    )
    getAllProducts.mockResolvedValue(many)
    const results = await searchCatalog('brass')
    expect(results).toHaveLength(8)
  })

  it('never throws — swallows a selector failure into []', async () => {
    getAllProducts.mockRejectedValue(new Error('db down'))
    await expect(searchCatalog('brass')).resolves.toEqual([])
  })
})
