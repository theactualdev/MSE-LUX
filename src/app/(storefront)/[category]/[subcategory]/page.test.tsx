import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Category, Subcategory } from '@/types/catalog'

const getCategoryBySlug = vi.fn()
const getSubcategory = vi.fn()
vi.mock('@/features/catalog/server/selectors', () => ({
  getAllCategories: vi.fn(),
  getCategoryBySlug: (...args: [string]) => getCategoryBySlug(...args),
  getSubcategory: (...args: [string, string]) => getSubcategory(...args),
  getProductsBySubcategory: vi.fn(),
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

function makeSubcategory(overrides: Partial<Subcategory> & { slug: string; categorySlug: string }): Subcategory {
  return {
    name: `Subcategory ${overrides.slug}`,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

// `generateMetadata` only destructures `params`, but `SubcategoryPageProps`
// requires `searchParams` too — this page's canonical deliberately never
// reads it (see the page's comment), so an empty resolved value is fine here.
const searchParams = Promise.resolve({})

describe('generateMetadata', () => {
  it('returns {} when the subcategory does not exist', async () => {
    getSubcategory.mockResolvedValue(undefined)

    const result = await generateMetadata({
      params: Promise.resolve({ category: 'rings', subcategory: 'missing' }),
      searchParams,
    })

    expect(result).toEqual({})
  })

  it('sets canonical (bare path) and absolute openGraph.url', async () => {
    getSubcategory.mockResolvedValue(makeSubcategory({ slug: 'signet', categorySlug: 'rings', name: 'Signet Rings' }))
    getCategoryBySlug.mockResolvedValue(makeCategory({ slug: 'rings', name: 'Rings' }))

    const result = await generateMetadata({
      params: Promise.resolve({ category: 'rings', subcategory: 'signet' }),
      searchParams,
    })

    expect(result.alternates).toEqual({ canonical: '/rings/signet' })
    expect(result.openGraph).toMatchObject({
      type: 'website',
      url: `${SITE_URL}/rings/signet`,
    })
    expect(result.twitter).toMatchObject({ card: 'summary_large_image' })
  })

  // Subcategory has no `image` field on the type (unlike Category/Collection),
  // so there's never a hero to include — and per the storefront layout's
  // comment there's no '/og-default.png' to fall back to either. Pins that
  // the `images` key never sneaks back in.
  it('never sets the images key on openGraph or twitter (subcategory has no image field)', async () => {
    getSubcategory.mockResolvedValue(makeSubcategory({ slug: 'signet', categorySlug: 'rings', name: 'Signet Rings' }))
    getCategoryBySlug.mockResolvedValue(makeCategory({ slug: 'rings', name: 'Rings' }))

    const result = await generateMetadata({
      params: Promise.resolve({ category: 'rings', subcategory: 'signet' }),
      searchParams,
    })

    expect(result.openGraph).not.toHaveProperty('images')
    expect(result.twitter).not.toHaveProperty('images')
    expect(JSON.stringify(result)).not.toContain('og-default.png')
  })
})
