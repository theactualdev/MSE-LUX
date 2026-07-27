import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Collection } from '@/types/catalog'

const getCollectionBySlug = vi.fn()
vi.mock('@/features/catalog/server/selectors', () => ({
  getAllCollections: vi.fn(),
  getCollectionBySlug: (...args: [string]) => getCollectionBySlug(...args),
  getProductsInCollection: vi.fn(),
}))

const { generateMetadata } = await import('./page')
const { SITE_URL } = await import('@/lib/seo')

function makeCollection(overrides: Partial<Collection> & { slug: string }): Collection {
  return {
    name: `Collection ${overrides.slug}`,
    productSlugs: [],
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('generateMetadata', () => {
  it('returns {} when the collection does not exist', async () => {
    getCollectionBySlug.mockResolvedValue(undefined)

    const result = await generateMetadata({ params: Promise.resolve({ slug: 'missing' }) })

    expect(result).toEqual({})
  })

  it('sets canonical, absolute openGraph.url, and openGraph/twitter images when the collection has an image', async () => {
    const collection = makeCollection({ slug: 'bridal', name: 'Bridal', image: '/bridal.jpg' })
    getCollectionBySlug.mockResolvedValue(collection)

    const result = await generateMetadata({ params: Promise.resolve({ slug: 'bridal' }) })

    expect(result.alternates).toEqual({ canonical: '/collections/bridal' })
    expect(result.openGraph).toMatchObject({
      type: 'website',
      url: `${SITE_URL}/collections/bridal`,
      images: [`${SITE_URL}/bridal.jpg`],
    })
    expect(result.twitter).toMatchObject({
      card: 'summary_large_image',
      images: [`${SITE_URL}/bridal.jpg`],
    })
  })

  // Pins the fix: a collection with no image must NOT fall back to a
  // '/og-default.png' that doesn't exist — Facebook/LinkedIn cache a 404
  // image per-URL, so a pre-launch share would stay broken after the real
  // asset lands. The `images` key must be absent entirely, not [undefined].
  it('omits the images key on both openGraph and twitter when the collection has no image', async () => {
    const collection = makeCollection({ slug: 'everyday', name: 'Everyday', image: undefined })
    getCollectionBySlug.mockResolvedValue(collection)

    const result = await generateMetadata({ params: Promise.resolve({ slug: 'everyday' }) })

    expect(result.openGraph).not.toHaveProperty('images')
    expect(result.twitter).not.toHaveProperty('images')
    expect(JSON.stringify(result)).not.toContain('og-default.png')
  })
})
