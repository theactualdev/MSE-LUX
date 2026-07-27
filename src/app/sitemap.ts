import type { MetadataRoute } from 'next'
import { absoluteUrl } from '@/lib/seo'
import { getAllCategories, getAllCollections, getAllProducts } from '@/features/catalog/server/selectors'

// Matches the storefront's ISR window so a catalog edit made in admin
// surfaces in the sitemap on its own, without a redeploy.
export const revalidate = 3600

const STATIC_PAGES: { path: string; priority: number }[] = [
  { path: '/', priority: 1 },
  { path: '/collections', priority: 0.8 },
  { path: '/about', priority: 0.5 },
  { path: '/faq', priority: 0.5 },
  { path: '/contact', priority: 0.5 },
  { path: '/policies/privacy', priority: 0.3 },
  { path: '/policies/shipping-returns', priority: 0.3 },
  { path: '/policies/terms', priority: 0.3 },
]

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [products, collections, categories] = await Promise.all([
    getAllProducts(),
    getAllCollections(),
    getAllCategories(),
  ])

  // `lastModified` is omitted on every entry below: the domain types
  // (`Product`, `Collection`, `Category`) carry no `updatedAt` field, and
  // stamping `new Date()` per entry would rewrite every URL's lastModified
  // on every regeneration (this route revalidates hourly) regardless of
  // whether anything actually changed — churn that teaches crawlers
  // nothing and can make them trust the signal less.
  const staticEntries: MetadataRoute.Sitemap = STATIC_PAGES.map(({ path, priority }) => ({
    url: absoluteUrl(path),
    changeFrequency: 'monthly',
    priority,
  }))

  const productEntries: MetadataRoute.Sitemap = products.map((product) => ({
    url: absoluteUrl(`/products/${product.slug}`),
    changeFrequency: 'daily',
    priority: 0.6,
  }))

  const collectionEntries: MetadataRoute.Sitemap = collections.map((collection) => ({
    url: absoluteUrl(`/collections/${collection.slug}`),
    changeFrequency: 'weekly',
    priority: 0.6,
  }))

  const categoryEntries: MetadataRoute.Sitemap = categories.map((category) => ({
    url: absoluteUrl(`/${category.slug}`),
    changeFrequency: 'weekly',
    priority: 0.6,
  }))

  const subcategoryEntries: MetadataRoute.Sitemap = categories.flatMap((category) =>
    category.subcategories.map((subcategory) => ({
      url: absoluteUrl(`/${category.slug}/${subcategory.slug}`),
      changeFrequency: 'weekly' as const,
      priority: 0.5,
    })),
  )

  return [...staticEntries, ...productEntries, ...collectionEntries, ...categoryEntries, ...subcategoryEntries]
}
