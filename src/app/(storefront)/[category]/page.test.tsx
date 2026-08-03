import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Category } from '@/types/catalog'

const getCategoryBySlug = vi.fn()
vi.mock('@/features/catalog/server/selectors', () => ({
  getAllCategories: vi.fn(),
  getCategoryBySlug: (...args: [string]) => getCategoryBySlug(...args),
  getProductsByCategory: vi.fn(),
}))

const { generateMetadata } = await import('./page')
const { SITE_URL } = await import('@/lib/seo')

function makeCategory(overrides: Partial<Category> & { slug: string }): Category {
  return {
    name: `Category ${overrides.slug}`,
    subcategories: [],
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

// `generateMetadata` only destructures `params`, but `CategoryPageProps`
// requires `searchParams` too — this page's canonical deliberately never
// reads it (see the page's comment), so an empty resolved value is fine here.
const searchParams = Promise.resolve({})

describe('generateMetadata', () => {
  it('returns {} when the category does not exist', async () => {
    getCategoryBySlug.mockResolvedValue(undefined)

    const result = await generateMetadata({ params: Promise.resolve({ category: 'missing' }), searchParams })

    expect(result).toEqual({})
  })

  it('sets canonical (bare path), absolute openGraph.url, and openGraph/twitter images when the category has an image', async () => {
    const category = makeCategory({ slug: 'rings', name: 'Rings', image: '/rings.jpg' })
    getCategoryBySlug.mockResolvedValue(category)

    const result = await generateMetadata({ params: Promise.resolve({ category: 'rings' }), searchParams })

    expect(result.alternates).toEqual({ canonical: '/rings' })
    expect(result.openGraph).toMatchObject({
      type: 'website',
      url: `${SITE_URL}/rings`,
      images: [`${SITE_URL}/rings.jpg`],
    })
    expect(result.twitter).toMatchObject({
      card: 'summary_large_image',
      images: [`${SITE_URL}/rings.jpg`],
    })
  })

  // Previously pinned the opposite — that no fallback was emitted, because
  // '/og-default.png' did not exist and a 404 is cached per-URL by
  // Facebook/LinkedIn. The asset is now committed, so an image-less category
  // takes the brand card rather than replacing the layout's openGraph object
  // with one carrying no image at all.
  it('falls back to the default OG image on both cards when the category has no image', async () => {
    const category = makeCategory({ slug: 'necklaces', name: 'Necklaces', image: undefined })
    getCategoryBySlug.mockResolvedValue(category)

    const result = await generateMetadata({ params: Promise.resolve({ category: 'necklaces' }), searchParams })

    expect(result.openGraph).toHaveProperty('images', [`${SITE_URL}/og-default.png`])
    expect(result.twitter).toHaveProperty('images', [`${SITE_URL}/og-default.png`])
  })
})
