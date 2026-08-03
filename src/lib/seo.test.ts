import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Product } from '@/types/catalog'
import { siteConfig } from '@/lib/config'
import { CONTACT_INFO } from '@/features/content/data/contact'
import { FAQ_GROUPS } from '@/features/content/data/faq'
import {
  DEFAULT_OG_IMAGE,
  LOGO_IMAGE,
  SITE_URL,
  absoluteUrl,
  breadcrumbJsonLd,
  faqJsonLd,
  organizationJsonLd,
  pageCards,
  priceString,
  productJsonLd,
  webSiteJsonLd,
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

describe('pageCards', () => {
  // A caller with no image REPLACES the layout's openGraph object wholesale
  // (Next does not merge per-field), so omitting `images` here would unfurl a
  // blank card — strictly worse than setting nothing at all. The default is
  // what keeps an image-less product shareable.
  it('falls back to the default OG image on both cards when image is omitted', () => {
    const result = pageCards({ title: 'Rings', description: 'Shop rings.', path: '/rings' })

    expect(result).toEqual({
      openGraph: {
        type: 'website',
        siteName: siteConfig.name,
        title: 'Rings',
        description: 'Shop rings.',
        url: `${SITE_URL}/rings`,
        images: [`${SITE_URL}${DEFAULT_OG_IMAGE}`],
      },
      twitter: {
        card: 'summary_large_image',
        title: 'Rings',
        description: 'Shop rings.',
        images: [`${SITE_URL}${DEFAULT_OG_IMAGE}`],
      },
    })
  })

  it('includes an absolute images array on both openGraph and twitter when image is provided', () => {
    const result = pageCards({
      title: 'Bridal',
      description: 'Shop bridal.',
      path: '/collections/bridal',
      image: '/bridal.jpg',
    })

    expect(result).toEqual({
      openGraph: {
        type: 'website',
        siteName: siteConfig.name,
        title: 'Bridal',
        description: 'Shop bridal.',
        url: `${SITE_URL}/collections/bridal`,
        images: [`${SITE_URL}/bridal.jpg`],
      },
      twitter: {
        card: 'summary_large_image',
        title: 'Bridal',
        description: 'Shop bridal.',
        images: [`${SITE_URL}/bridal.jpg`],
      },
    })
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
      description: siteConfig.description,
      url: SITE_URL,
      logo: `${SITE_URL}${LOGO_IMAGE}`,
      image: `${SITE_URL}${DEFAULT_OG_IMAGE}`,
      address: {
        '@type': 'PostalAddress',
        addressLocality: 'Lagos',
        addressCountry: 'NG',
      },
      contactPoint: {
        '@type': 'ContactPoint',
        contactType: 'customer support',
        email: CONTACT_INFO.email,
        areaServed: 'Worldwide',
        availableLanguage: 'English',
      },
      sameAs: [siteConfig.social.instagram],
    })
  })

  // Google reads `logo` for the SERP/knowledge-panel mark and does not accept
  // SVG for it. Pinning the extension stops a future "just use the SVG"
  // simplification from silently dropping the site out of that treatment.
  it('points logo at an absolute raster URL', () => {
    const { logo } = organizationJsonLd() as { logo: string }

    expect(logo).toBe(`${SITE_URL}/logo.png`)
    expect(logo.endsWith('.svg')).toBe(false)
  })
})

describe('webSiteJsonLd', () => {
  it('builds a WebSite node with a SearchAction', () => {
    expect(webSiteJsonLd()).toEqual({
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: siteConfig.name,
      url: SITE_URL,
      potentialAction: {
        '@type': 'SearchAction',
        target: {
          '@type': 'EntryPoint',
          urlTemplate: `${SITE_URL}/search?q={search_term_string}`,
        },
        'query-input': 'required name=search_term_string',
      },
    })
  })

  // The searchbox is only useful if the parameter matches what /search
  // actually parses. `parseSearchCriteria` reads `q`; a mismatch would render
  // a searchbox that quietly returns the unfiltered catalog.
  it('targets the q parameter that parseSearchCriteria reads', () => {
    const { potentialAction } = webSiteJsonLd() as {
      potentialAction: { target: { urlTemplate: string } }
    }

    expect(potentialAction.target.urlTemplate).toContain('/search?q={search_term_string}')
  })
})

describe('faqJsonLd', () => {
  it('flattens grouped questions into a single mainEntity list', () => {
    const result = faqJsonLd([
      { heading: 'Orders', items: [{ q: 'Where from?', a: 'Lagos.' }] },
      {
        heading: 'Care',
        items: [
          { q: 'How to clean?', a: 'Soft cloth.' },
          { q: 'Water safe?', a: 'No.' },
        ],
      },
    ])

    expect(result).toEqual({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: [
        { '@type': 'Question', name: 'Where from?', acceptedAnswer: { '@type': 'Answer', text: 'Lagos.' } },
        { '@type': 'Question', name: 'How to clean?', acceptedAnswer: { '@type': 'Answer', text: 'Soft cloth.' } },
        { '@type': 'Question', name: 'Water safe?', acceptedAnswer: { '@type': 'Answer', text: 'No.' } },
      ],
    })
  })

  // Guards the rule that makes this markup legitimate: every question in the
  // structured data must be one the page actually renders. Building from the
  // real FAQ_GROUPS is what enforces that, so the counts must agree.
  it('emits exactly as many questions as the rendered FAQ contains', () => {
    const { mainEntity } = faqJsonLd(FAQ_GROUPS) as { mainEntity: unknown[] }
    const rendered = FAQ_GROUPS.reduce((total, group) => total + group.items.length, 0)

    expect(mainEntity).toHaveLength(rendered)
    expect(rendered).toBeGreaterThan(0)
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
      brand: { '@type': 'Brand', name: siteConfig.name },
      offers: {
        '@type': 'Offer',
        price: '50000.00',
        priceCurrency: 'NGN',
        availability: 'https://schema.org/InStock',
        url: `${SITE_URL}/products/gold-signet-ring`,
      },
    })
  })

  it('derives priceValidUntil from the injected clock, as a plain ISO date', () => {
    const result = productJsonLd(PRODUCT, 'NGN', new Date('2026-01-15T09:30:00.000Z')) as {
      offers: { priceValidUntil: string }
    }

    expect(result.offers.priceValidUntil).toBe('2027-01-15')
  })

  it('marks the offer new, sold by the store, with the published return policy', () => {
    const result = productJsonLd(PRODUCT, 'NGN') as { offers: Record<string, unknown> }

    expect(result.offers).toMatchObject({
      itemCondition: 'https://schema.org/NewCondition',
      seller: { '@type': 'Organization', name: siteConfig.name },
      hasMerchantReturnPolicy: {
        '@type': 'MerchantReturnPolicy',
        applicableCountry: 'NG',
        returnPolicyCategory: 'https://schema.org/MerchantReturnFiniteReturnWindow',
        // The policy prose grants "2–3 days"; the schema field is a single
        // number, so it must take the outer bound or it would deny a return
        // the published policy allows.
        merchantReturnDays: 3,
        returnMethod: 'https://schema.org/ReturnByMail',
        returnFees: 'https://schema.org/ReturnShippingFees',
      },
    })
  })

  // Nigerian shipping is quoted live per address and weight at checkout, so
  // no single rate is true. Delivery TIME is published and safe to state;
  // a rate would be a price claim the checkout then contradicts.
  it('states delivery time but never a shipping rate', () => {
    const result = productJsonLd(PRODUCT, 'NGN') as {
      offers: { shippingDetails: Record<string, unknown> }
    }

    expect(result.offers.shippingDetails).toMatchObject({
      '@type': 'OfferShippingDetails',
      shippingDestination: { '@type': 'DefinedRegion', addressCountry: 'NG' },
      deliveryTime: {
        handlingTime: { minValue: 5, maxValue: 8, unitCode: 'DAY' },
        transitTime: { minValue: 2, maxValue: 10, unitCode: 'DAY' },
      },
    })
    expect(result.offers.shippingDetails).not.toHaveProperty('shippingRate')
  })

  // Review markup with no review system behind it is grounds for a manual
  // action. The home page testimonials are brand-level and do not map to
  // individual products, so nothing here may claim a rating.
  it('never claims a rating or reviews', () => {
    const result = productJsonLd(PRODUCT, 'NGN')

    expect(result).not.toHaveProperty('aggregateRating')
    expect(result).not.toHaveProperty('review')
  })

  // Pins the fix: an image-less product must not emit `image: []` — Google's
  // structured-data validator treats an empty array as present-but-invalid,
  // not as "field absent". The `image` key must be missing entirely.
  it('omits the image key entirely when the product has no images', () => {
    const imageless: Product = { ...PRODUCT, images: [] }
    const result = productJsonLd(imageless, 'NGN')

    expect(result).not.toHaveProperty('image')
  })

  it('includes a Brand node built from siteConfig.name', () => {
    const result = productJsonLd(PRODUCT, 'NGN')

    expect(result.brand).toEqual({ '@type': 'Brand', name: siteConfig.name })
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
