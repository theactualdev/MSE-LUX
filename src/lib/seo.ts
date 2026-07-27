import type { Metadata } from 'next'
import { env } from '@/lib/env'
import { siteConfig } from '@/lib/config'
import type { CatalogCurrency, Product } from '@/types/catalog'

/** Canonical site origin, no trailing slash. `NEXT_PUBLIC_SITE_URL` in prod; localhost in dev. */
// `env.ts`'s Zod schema owns validation and the localhost default; this only normalises a trailing slash so every SITE_URL consumer can safely concatenate paths.
export const SITE_URL: string = env.NEXT_PUBLIC_SITE_URL.replace(/\/+$/, '')

/** `absoluteUrl('/products/x')` → `${SITE_URL}/products/x`; passes through absolute inputs unchanged. */
export function absoluteUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${SITE_URL}${normalizedPath}`
}

/**
 * Shared `openGraph`/`twitter` builder for per-page metadata. Next merges
 * `generateMetadata`'s return SHALLOWLY onto the layout's `metadata` — the
 * layout's `openGraph` deliberately carries only `type`/`siteName` (see its
 * comment) so this per-page object, once spread into a page's `openGraph`,
 * both backfills the page's own title/description into og:* AND regains
 * `og:site_name` from the merge.
 *
 * The conditional-images invariant lives HERE: no `/og-default.png` fallback
 * exists yet (see the storefront layout's comment on why), so `images` is
 * included only when the caller has a real one — never referencing that path.
 */
export function pageCards({
  title,
  description,
  path,
  image,
}: {
  title: string
  description: string
  path: string
  image?: string
}): Pick<Metadata, 'openGraph' | 'twitter'> {
  const absoluteImage = image ? absoluteUrl(image) : undefined

  return {
    openGraph: {
      type: 'website',
      siteName: siteConfig.name,
      title,
      description,
      url: absoluteUrl(path),
      ...(absoluteImage ? { images: [absoluteImage] } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      ...(absoluteImage ? { images: [absoluteImage] } : {}),
    },
  }
}

/** Minor units → JSON-LD decimal string, e.g. 4_500_000 → '45000.00'. Derived from integer minor units, never floats. */
export function priceString(amountMinor: number): string {
  return (amountMinor / 100).toFixed(2)
}

const CURRENCY_KEY: Record<CatalogCurrency, 'ngn' | 'usd'> = { NGN: 'ngn', USD: 'usd' }

export function organizationJsonLd(): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: siteConfig.name,
    url: SITE_URL,
    sameAs: [siteConfig.social.instagram],
  }
}

export function productJsonLd(product: Product, currency: CatalogCurrency): Record<string, unknown> {
  const key = CURRENCY_KEY[currency]
  const priceSet = product.salePriceSet ?? product.priceSet
  // A variant product's own `inventory` column is unused (schema tracks
  // per-variant inventory instead), so availability must also check variants.
  const inStock = product.inventory > 0 || product.variants.some((variant) => variant.inventory > 0)

  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.shortDescription,
    sku: product.sku,
    // Omit `image` entirely for an image-less product rather than emitting
    // `image: []` — Google's structured-data validator treats an empty array
    // as a present-but-invalid value, not as "field absent".
    ...(product.images.length > 0 ? { image: product.images.map((image) => absoluteUrl(image.src)) } : {}),
    brand: { '@type': 'Brand', name: siteConfig.name },
    offers: {
      '@type': 'Offer',
      price: priceString(priceSet[key].amountMinor),
      priceCurrency: currency,
      availability: inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      url: absoluteUrl(`/products/${product.slug}`),
    },
  }
}

export function breadcrumbJsonLd(trail: Array<{ name: string; path: string }>): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: crumb.name,
      item: absoluteUrl(crumb.path),
    })),
  }
}
