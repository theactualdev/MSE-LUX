import { describe, expect, it } from 'vitest'
import robots from './robots'
import { SITE_URL } from '@/lib/seo'

describe('robots', () => {
  it('allows / for all crawlers', () => {
    const result = robots()

    expect(result.rules).toEqual(
      expect.objectContaining({
        userAgent: '*',
        allow: '/',
      }),
    )
  })

  it('disallows exactly the private/utility routes', () => {
    const result = robots()
    const rules = Array.isArray(result.rules) ? result.rules[0] : result.rules

    expect(rules.disallow).toEqual([
      // The internal component showcase — never customer content.
      '/_design',
      // Bare routes (unslashed): a trailing slash would leave the real
      // `/admin` and `/account` pages themselves crawlable, since disallow
      // matches on literal path prefix, not a directory glob.
      '/admin',
      '/api/',
      '/checkout',
      '/account',
      '/order/',
      '/login',
      '/signup',
      '/reset-password',
      '/forgot-password',
      // The confirm/unsubscribe fetch is the side effect; robots.txt is
      // what stops a crawler from ever triggering it.
      '/newsletter',
    ])
  })

  it('points sitemap at the absolute sitemap.xml URL', () => {
    const result = robots()

    expect(result.sitemap).toBe(`${SITE_URL}/sitemap.xml`)
  })
})
