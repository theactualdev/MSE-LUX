import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/seo'

/**
 * Static, synchronous robots policy. Disallows admin, the API surface, and
 * every personal/checkout/auth route (checkout, account, order history,
 * login/signup/password-reset) — none of that is meant to be indexed or is
 * useful to a crawler. Everything else (product, category, collection, and
 * static content pages) stays open.
 *
 * `/_design` is the internal component showcase — not customer content, and
 * indexing it would surface raw design-system fragments in search results.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/_design',
        '/admin/',
        '/api/',
        '/checkout',
        '/account/',
        '/order/',
        '/login',
        '/signup',
        '/reset-password',
        '/forgot-password',
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
