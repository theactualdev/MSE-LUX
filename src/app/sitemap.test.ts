import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Category, Collection, Product } from '@/types/catalog'

const getAllProducts = vi.fn()
const getAllCollections = vi.fn()
const getAllCategories = vi.fn()
vi.mock('@/features/catalog/server/selectors', () => ({
  getAllProducts: (...args: []) => getAllProducts(...args),
  getAllCollections: (...args: []) => getAllCollections(...args),
  getAllCategories: (...args: []) => getAllCategories(...args),
}))

const { default: sitemap } = await import('./sitemap')
const { SITE_URL } = await import('@/lib/seo')

function makeProduct(overrides: Partial<Product> & { id: string; slug: string }): Product {
  return {
    name: `Product ${overrides.id}`,
    shortDescription: 'A lovely piece.',
    description: 'A lovely piece, described in full.',
    priceSet: {
      ngn: { amountMinor: 500_000, currency: 'NGN' },
      usd: { amountMinor: 30_000, currency: 'USD' },
    },
    sku: `SKU-${overrides.id}`,
    inventory: 10,
    material: 'Gold',
    materialTags: ['Gold-plated'],
    categorySlug: 'rings',
    collectionSlugs: [],
    images: [{ src: '/img.jpg', alt: 'img' }],
    optionTypes: [],
    variants: [],
    badges: [],
    status: 'active',
    seo: {},
    ...overrides,
  }
}

function makeCollection(overrides: Partial<Collection> & { slug: string }): Collection {
  return {
    name: `Collection ${overrides.slug}`,
    productSlugs: [],
    ...overrides,
  }
}

function makeCategory(overrides: Partial<Category> & { slug: string }): Category {
  return {
    name: `Category ${overrides.slug}`,
    subcategories: [],
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  getAllProducts.mockResolvedValue([])
  getAllCollections.mockResolvedValue([])
  getAllCategories.mockResolvedValue([])
})

describe('sitemap', () => {
  it('includes the static page set with absolute URLs', async () => {
    const result = await sitemap()
    const urls = result.map((entry) => entry.url)

    expect(urls).toEqual(
      expect.arrayContaining([
        `${SITE_URL}/`,
        `${SITE_URL}/collections`,
        `${SITE_URL}/about`,
        `${SITE_URL}/faq`,
        `${SITE_URL}/contact`,
        `${SITE_URL}/policies/privacy`,
        `${SITE_URL}/policies/shipping-returns`,
        `${SITE_URL}/policies/terms`,
      ]),
    )
  })

  it('includes one entry per active product', async () => {
    getAllProducts.mockResolvedValue([
      makeProduct({ id: '1', slug: 'gold-ring' }),
      makeProduct({ id: '2', slug: 'silver-band' }),
    ])

    const result = await sitemap()
    const urls = result.map((entry) => entry.url)

    expect(urls).toContain(`${SITE_URL}/products/gold-ring`)
    expect(urls).toContain(`${SITE_URL}/products/silver-band`)
  })

  it('includes one entry per collection', async () => {
    getAllCollections.mockResolvedValue([makeCollection({ slug: 'bestsellers' })])

    const result = await sitemap()
    const urls = result.map((entry) => entry.url)

    expect(urls).toContain(`${SITE_URL}/collections/bestsellers`)
  })

  it('includes one entry per category and per subcategory', async () => {
    getAllCategories.mockResolvedValue([
      makeCategory({
        slug: 'rings',
        subcategories: [
          { slug: 'engagement', name: 'Engagement', categorySlug: 'rings' },
          { slug: 'wedding-bands', name: 'Wedding bands', categorySlug: 'rings' },
        ],
      }),
    ])

    const result = await sitemap()
    const urls = result.map((entry) => entry.url)

    expect(urls).toContain(`${SITE_URL}/rings`)
    expect(urls).toContain(`${SITE_URL}/rings/engagement`)
    expect(urls).toContain(`${SITE_URL}/rings/wedding-bands`)
  })

  it('every url is absolute', async () => {
    getAllProducts.mockResolvedValue([makeProduct({ id: '1', slug: 'gold-ring' })])
    getAllCollections.mockResolvedValue([makeCollection({ slug: 'bestsellers' })])
    getAllCategories.mockResolvedValue([makeCategory({ slug: 'rings' })])

    const result = await sitemap()

    for (const entry of result) {
      expect(entry.url.startsWith(SITE_URL)).toBe(true)
    }
  })

  it('never includes admin, checkout, account, order, search, cart, or wishlist entries', async () => {
    getAllProducts.mockResolvedValue([makeProduct({ id: '1', slug: 'gold-ring' })])
    getAllCollections.mockResolvedValue([makeCollection({ slug: 'bestsellers' })])
    getAllCategories.mockResolvedValue([makeCategory({ slug: 'rings' })])

    const result = await sitemap()
    const urls = result.map((entry) => entry.url)

    for (const forbidden of ['/admin', '/checkout', '/account', '/order', '/search', '/cart', '/wishlist']) {
      expect(urls.some((url) => url.includes(forbidden))).toBe(false)
    }
  })

  it('home has the highest priority of all entries', async () => {
    getAllProducts.mockResolvedValue([makeProduct({ id: '1', slug: 'gold-ring' })])
    getAllCollections.mockResolvedValue([makeCollection({ slug: 'bestsellers' })])
    getAllCategories.mockResolvedValue([makeCategory({ slug: 'rings' })])

    const result = await sitemap()
    const home = result.find((entry) => entry.url === `${SITE_URL}/`)
    const maxPriority = Math.max(...result.map((entry) => entry.priority ?? 0))

    expect(home?.priority).toBe(maxPriority)
  })

  it('every entry carries a changeFrequency', async () => {
    getAllProducts.mockResolvedValue([makeProduct({ id: '1', slug: 'gold-ring' })])
    getAllCollections.mockResolvedValue([makeCollection({ slug: 'bestsellers' })])
    getAllCategories.mockResolvedValue([makeCategory({ slug: 'rings' })])

    const result = await sitemap()

    for (const entry of result) {
      expect(entry.changeFrequency).toBeDefined()
    }
  })
})
