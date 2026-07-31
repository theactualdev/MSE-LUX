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
        // `robots.txt` disallow entries match on literal path prefix, not as
        // a directory glob — a trailing slash means the bare route
        // (`/admin`, `/account`) is NOT covered and stays crawlable. `/admin`
        // and `/account` are both real, unslashed routes, so the slash is
        // dropped here. `/api/` keeps its slash: there's no bare `/api`
        // route (every handler lives under a subpath), so it's already
        // covering everything that exists.
        '/admin',
        '/api/',
        '/checkout',
        '/account',
        '/order/',
        '/login',
        '/signup',
        '/reset-password',
        '/forgot-password',
        // The confirm/unsubscribe pages' fetch IS the side effect (token
        // consumed on load), and their per-page noindex meta is only read
        // AFTER that fetch runs — robots.txt is the layer that actually
        // stops a crawler from triggering the request in the first place.
        '/newsletter',
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
