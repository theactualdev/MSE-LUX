import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Category, Product, Subcategory } from '@/types/catalog'

const getProductBySlug = vi.fn()
const getCategoryBySlug = vi.fn()
const getSubcategory = vi.fn()
vi.mock('@/features/catalog/server/selectors', () => ({
  getAllProducts: vi.fn(),
  getProductBySlug: (...args: [string]) => getProductBySlug(...args),
  getRelatedProducts: vi.fn(),
  getCategoryBySlug: (...args: [string]) => getCategoryBySlug(...args),
  getSubcategory: (...args: [string, string]) => getSubcategory(...args),
}))

const { generateMetadata, buildBreadcrumbTrail } = await import('./page')
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

function makeCategory(overrides: Partial<Category> & { slug: string }): Category {
  return {
    name: `Category ${overrides.slug}`,
    subcategories: [],
    ...overrides,
  }
}

function makeSubcategory(overrides: Partial<Subcategory> & { slug: string; categorySlug: string }): Subcategory {
  return {
    name: `Subcategory ${overrides.slug}`,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('generateMetadata', () => {
  it('returns {} when the product does not exist', async () => {
    getProductBySlug.mockResolvedValue(undefined)

    const result = await generateMetadata({ params: Promise.resolve({ slug: 'missing' }) })

    expect(result).toEqual({})
  })

  it('sets canonical, absolute openGraph.url, and openGraph/twitter images when the product has an image', async () => {
    const product = makeProduct({ id: '1', slug: 'gold-ring', images: [{ src: '/gold-ring.jpg', alt: 'Gold ring' }] })
    getProductBySlug.mockResolvedValue(product)

    const result = await generateMetadata({ params: Promise.resolve({ slug: 'gold-ring' }) })

    expect(result.alternates).toEqual({ canonical: '/products/gold-ring' })
    expect(result.openGraph).toMatchObject({
      type: 'website',
      url: `${SITE_URL}/products/gold-ring`,
      images: [`${SITE_URL}/gold-ring.jpg`],
    })
    expect(result.twitter).toMatchObject({
      card: 'summary_large_image',
      images: [`${SITE_URL}/gold-ring.jpg`],
    })
  })

  // This test previously pinned the OPPOSITE: that no fallback was emitted,
  // because '/og-default.png' did not exist and a 404 is cached per-URL by
  // Facebook/LinkedIn. The asset now exists and is committed, so the correct
  // behaviour inverts — and it matters here more than anywhere, because a
  // product's `images` relation is 0..n. Setting `openGraph` replaces the
  // layout's object wholesale, so without this fallback an image-less product
  // would unfurl as a blank card.
  it('falls back to the default OG image on both cards when the product has no images', async () => {
    const product = makeProduct({ id: '2', slug: 'bare-band', images: [] })
    getProductBySlug.mockResolvedValue(product)

    const result = await generateMetadata({ params: Promise.resolve({ slug: 'bare-band' }) })

    expect(result.openGraph).toHaveProperty('images', [`${SITE_URL}/og-default.png`])
    expect(result.twitter).toHaveProperty('images', [`${SITE_URL}/og-default.png`])
  })
})

describe('buildBreadcrumbTrail', () => {
  it('builds Home -> category -> subcategory -> product for a fully-categorised product', async () => {
    const product = makeProduct({
      id: '1',
      slug: 'gold-signet-ring',
      name: 'Gold Signet Ring',
      categorySlug: 'rings',
      subcategorySlug: 'signet',
    })
    getCategoryBySlug.mockResolvedValue(makeCategory({ slug: 'rings', name: 'Rings' }))
    getSubcategory.mockResolvedValue(makeSubcategory({ slug: 'signet', categorySlug: 'rings', name: 'Signet Rings' }))

    const trail = await buildBreadcrumbTrail(product)

    expect(trail).toEqual([
      { name: 'Home', path: '/' },
      { name: 'Rings', path: '/rings' },
      { name: 'Signet Rings', path: '/rings/signet' },
      { name: 'Gold Signet Ring', path: '/products/gold-signet-ring' },
    ])
  })

  it('omits the subcategory crumb (and never renders "undefined") when the subcategory lookup misses', async () => {
    const product = makeProduct({
      id: '2',
      slug: 'gold-band',
      name: 'Gold Band',
      categorySlug: 'rings',
      subcategorySlug: 'stale-slug',
    })
    getCategoryBySlug.mockResolvedValue(makeCategory({ slug: 'rings', name: 'Rings' }))
    getSubcategory.mockResolvedValue(undefined)

    const trail = await buildBreadcrumbTrail(product)

    expect(trail).toEqual([
      { name: 'Home', path: '/' },
      { name: 'Rings', path: '/rings' },
      { name: 'Gold Band', path: '/products/gold-band' },
    ])
    expect(trail.some((crumb) => crumb.path.includes('stale-slug'))).toBe(false)
    expect(JSON.stringify(trail)).not.toContain('undefined')
  })

  it('omits the category (and subcategory) crumb when the category lookup itself misses', async () => {
    const product = makeProduct({
      id: '3',
      slug: 'mystery-item',
      name: 'Mystery Item',
      categorySlug: 'stale-category',
      subcategorySlug: 'stale-subcategory',
    })
    getCategoryBySlug.mockResolvedValue(undefined)

    const trail = await buildBreadcrumbTrail(product)

    expect(trail).toEqual([
      { name: 'Home', path: '/' },
      { name: 'Mystery Item', path: '/products/mystery-item' },
    ])
    expect(getSubcategory).not.toHaveBeenCalled()
    expect(JSON.stringify(trail)).not.toContain('undefined')
  })

  it('has no subcategory crumb when the product has no subcategorySlug', async () => {
    const product = makeProduct({
      id: '4',
      slug: 'plain-ring',
      name: 'Plain Ring',
      categorySlug: 'rings',
      subcategorySlug: undefined,
    })
    getCategoryBySlug.mockResolvedValue(makeCategory({ slug: 'rings', name: 'Rings' }))

    const trail = await buildBreadcrumbTrail(product)

    expect(trail).toEqual([
      { name: 'Home', path: '/' },
      { name: 'Rings', path: '/rings' },
      { name: 'Plain Ring', path: '/products/plain-ring' },
    ])
    expect(getSubcategory).not.toHaveBeenCalled()
  })
})
