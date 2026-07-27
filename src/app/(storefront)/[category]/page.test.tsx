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

  // Pins the fix: a category with no image must NOT fall back to a
  // '/og-default.png' that doesn't exist — Facebook/LinkedIn cache a 404
  // image per-URL, so a pre-launch share would stay broken after the real
  // asset lands. The `images` key must be absent entirely, not [undefined].
  it('omits the images key on both openGraph and twitter when the category has no image', async () => {
    const category = makeCategory({ slug: 'necklaces', name: 'Necklaces', image: undefined })
    getCategoryBySlug.mockResolvedValue(category)

    const result = await generateMetadata({ params: Promise.resolve({ category: 'necklaces' }), searchParams })

    expect(result.openGraph).not.toHaveProperty('images')
    expect(result.twitter).not.toHaveProperty('images')
    expect(JSON.stringify(result)).not.toContain('og-default.png')
  })
})
