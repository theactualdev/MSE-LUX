import { siteConfig } from '@/lib/config'
import type { CatalogCurrency, Product } from '@/types/catalog'

/** Canonical site origin, no trailing slash. `NEXT_PUBLIC_SITE_URL` in prod; localhost in dev. */
export const SITE_URL: string = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/+$/, '')

/** `absoluteUrl('/products/x')` → `${SITE_URL}/products/x`; passes through absolute inputs unchanged. */
export function absoluteUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${SITE_URL}${normalizedPath}`
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
    image: product.images.map((image) => absoluteUrl(image.src)),
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
