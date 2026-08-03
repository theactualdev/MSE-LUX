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

  // Previously pinned the opposite — that no fallback was emitted, because
  // '/og-default.png' did not exist and a 404 is cached per-URL by
  // Facebook/LinkedIn. The asset is now committed, so an image-less
  // collection takes the brand card rather than replacing the layout's
  // openGraph object with one carrying no image at all.
  it('falls back to the default OG image on both cards when the collection has no image', async () => {
    const collection = makeCollection({ slug: 'everyday', name: 'Everyday', image: undefined })
    getCollectionBySlug.mockResolvedValue(collection)

    const result = await generateMetadata({ params: Promise.resolve({ slug: 'everyday' }) })

    expect(result.openGraph).toHaveProperty('images', [`${SITE_URL}/og-default.png`])
    expect(result.twitter).toHaveProperty('images', [`${SITE_URL}/og-default.png`])
  })
})
