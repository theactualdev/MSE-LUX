import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Product } from '@/types/catalog'
import { siteConfig } from '@/lib/config'
import {
  SITE_URL,
  absoluteUrl,
  breadcrumbJsonLd,
  organizationJsonLd,
  priceString,
  productJsonLd,
} from '@/lib/seo'

const PRODUCT: Product = {
  id: 'prod-1',
  name: 'Gold Signet Ring',
  slug: 'gold-signet-ring',
  shortDescription: 'A handcrafted gold signet ring.',
  description: 'A handcrafted gold signet ring, full description.',
  priceSet: {
    ngn: { amountMinor: 5_000_000, currency: 'NGN' },
    usd: { amountMinor: 300_000, currency: 'USD' },
  },
  sku: 'SKU-1',
  inventory: 5,
  material: 'Gold',
  materialTags: [],
  categorySlug: 'rings',
  collectionSlugs: [],
  images: [
    { src: '/gold-ring.jpg', alt: 'Gold Signet Ring' },
    { src: 'https://picsum.photos/seed/gold-ring/800', alt: 'Gold Signet Ring, alt angle' },
  ],
  optionTypes: [],
  variants: [],
  badges: [],
  status: 'active',
  seo: {},
}

describe('SITE_URL', () => {
  // `SITE_URL` now derives from `env.NEXT_PUBLIC_SITE_URL` (`@/lib/env`'s
  // Zod-validated, module-scope-parsed constant) rather than a raw
  // `process.env` read. `vi.resetModules()` clears the whole module
  // registry, so the dynamic `import('@/lib/seo')` below re-resolves its
  // `@/lib/env` dependency fresh too — both modules re-parse against the
  // currently stubbed env, no separate re-import of `@/lib/env` needed.
  const ORIGINAL_ENV = process.env.NEXT_PUBLIC_SITE_URL

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
    if (ORIGINAL_ENV === undefined) delete process.env.NEXT_PUBLIC_SITE_URL
    else process.env.NEXT_PUBLIC_SITE_URL = ORIGINAL_ENV
  })

  it('strips a trailing slash from the env value', async () => {
    vi.resetModules()
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://mselux.example/')
    const fresh = await import('@/lib/seo')
    expect(fresh.SITE_URL).toBe('https://mselux.example')
  })

  it('falls back to http://localhost:3000 when unset', async () => {
    vi.resetModules()
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', undefined)
    const fresh = await import('@/lib/seo')
    expect(fresh.SITE_URL).toBe('http://localhost:3000')
  })
})

describe('absoluteUrl', () => {
  it('joins a leading-slash path onto SITE_URL', () => {
    expect(absoluteUrl('/a')).toBe(`${SITE_URL}/a`)
  })

  it('normalises a path missing its leading slash', () => {
    expect(absoluteUrl('a')).toBe(`${SITE_URL}/a`)
  })

  it('passes an already-absolute URL through unchanged', () => {
    expect(absoluteUrl('https://x/y')).toBe('https://x/y')
  })
})

describe('priceString', () => {
  it('formats minor units as a two-decimal string, without float artefacts', () => {
    expect(priceString(4_500_000)).toBe('45000.00')
    expect(priceString(0)).toBe('0.00')
    expect(priceString(1)).toBe('0.01')
  })
})

describe('organizationJsonLd', () => {
  it('builds an Organization node from siteConfig', () => {
    expect(organizationJsonLd()).toEqual({
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: siteConfig.name,
      url: SITE_URL,
      sameAs: [siteConfig.social.instagram],
    })
  })
})

describe('productJsonLd', () => {
  it('builds a Product node with absolute images, InStock (product.inventory > 0), and the regular price', () => {
    const result = productJsonLd(PRODUCT, 'NGN')

    expect(result).toMatchObject({
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: 'Gold Signet Ring',
      description: 'A handcrafted gold signet ring.',
      sku: 'SKU-1',
      image: [`${SITE_URL}/gold-ring.jpg`, 'https://picsum.photos/seed/gold-ring/800'],
      offers: {
        '@type': 'Offer',
        price: '50000.00',
        priceCurrency: 'NGN',
        availability: 'https://schema.org/InStock',
        url: `${SITE_URL}/products/gold-signet-ring`,
      },
    })
  })

  it('prices in USD from the usd leg of priceSet when currency is USD', () => {
    const result = productJsonLd(PRODUCT, 'USD') as { offers: { price: string; priceCurrency: string } }
    expect(result.offers.price).toBe('3000.00')
    expect(result.offers.priceCurrency).toBe('USD')
  })

  it('prefers salePriceSet over priceSet when a sale price is present', () => {
    const onSale: Product = {
      ...PRODUCT,
      salePriceSet: {
        ngn: { amountMinor: 4_000_000, currency: 'NGN' },
        usd: { amountMinor: 250_000, currency: 'USD' },
      },
    }
    const result = productJsonLd(onSale, 'NGN') as { offers: { price: string } }
    expect(result.offers.price).toBe('40000.00')
  })

  it('is OutOfStock when the product has no inventory and no variant carries inventory', () => {
    const outOfStock: Product = { ...PRODUCT, inventory: 0 }
    const result = productJsonLd(outOfStock, 'NGN') as { offers: { availability: string } }
    expect(result.offers.availability).toBe('https://schema.org/OutOfStock')
  })

  it('is InStock when the product itself has no inventory but a variant does', () => {
    const variantProduct: Product = {
      ...PRODUCT,
      inventory: 0,
      variants: [
        { id: 'v1', sku: 'SKU-1-A', options: [{ name: 'Size', value: '18cm' }], inventory: 0 },
        { id: 'v2', sku: 'SKU-1-B', options: [{ name: 'Size', value: '20cm' }], inventory: 3 },
      ],
    }
    const result = productJsonLd(variantProduct, 'NGN') as { offers: { availability: string } }
    expect(result.offers.availability).toBe('https://schema.org/InStock')
  })

  it('is OutOfStock when the product has no inventory and every variant is also at zero', () => {
    const variantProduct: Product = {
      ...PRODUCT,
      inventory: 0,
      variants: [
        { id: 'v1', sku: 'SKU-1-A', options: [{ name: 'Size', value: '18cm' }], inventory: 0 },
        { id: 'v2', sku: 'SKU-1-B', options: [{ name: 'Size', value: '20cm' }], inventory: 0 },
      ],
    }
    const result = productJsonLd(variantProduct, 'NGN') as { offers: { availability: string } }
    expect(result.offers.availability).toBe('https://schema.org/OutOfStock')
  })
})

describe('breadcrumbJsonLd', () => {
  it('builds a BreadcrumbList with 1-based positions and absolute item URLs', () => {
    expect(
      breadcrumbJsonLd([
        { name: 'Home', path: '/' },
        { name: 'Rings', path: '/rings' },
      ]),
    ).toEqual({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_URL}/` },
        { '@type': 'ListItem', position: 2, name: 'Rings', item: `${SITE_URL}/rings` },
      ],
    })
  })
})
