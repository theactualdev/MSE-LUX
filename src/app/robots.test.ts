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
      '/admin/',
      '/api/',
      '/checkout',
      '/account/',
      '/order/',
      '/login',
      '/signup',
      '/reset-password',
      '/forgot-password',
    ])
  })

  it('points sitemap at the absolute sitemap.xml URL', () => {
    const result = robots()

    expect(result.sitemap).toBe(`${SITE_URL}/sitemap.xml`)
  })
})
