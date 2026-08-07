import { describe, it, expect } from 'vitest'
import { isGateExemptPath, safeReturnPath } from '@/features/gate/gate'

describe('isGateExemptPath', () => {
  it.each([
    // The gate itself, and its server-action POST target.
    '/gate',
    // Admin: its own, stronger auth (requireRole + per-action re-checks).
    '/admin',
    '/admin/orders',
    '/admin/catalog/new',
    // Server-to-server callers that cannot hold a browser cookie.
    '/api/paystack/webhook',
    '/api/cron/reap-orders',
    // OAuth code exchange mid-login.
    '/auth/callback',
    // Path names only, no product data.
    '/robots.txt',
  ])('exempts %s', (path) => {
    expect(isGateExemptPath(path)).toBe(true)
  })

  it.each([
    '/',
    '/jewelry',
    '/products/orisun-bracelet',
    '/cart',
    '/checkout',
    '/account',
    '/wishlist/shared/some-token',
    '/search',
    '/login',
    // The sitemap enumerates product slugs — exactly the content the gate hides.
    '/sitemap.xml',
    // Deny-by-default: unknown future routes are gated without registration.
    '/some-route-added-next-month',
    // Prefix cousins of exempt paths must NOT ride along.
    '/administrator',
    '/gateway',
    '/api/fx-rates',
    '/api/paystack/webhook-evil',
  ])('gates %s', (path) => {
    expect(isGateExemptPath(path)).toBe(false)
  })
})

describe('safeReturnPath', () => {
  it('passes ordinary internal paths through, query included', () => {
    expect(safeReturnPath('/products/orisun-bracelet')).toBe('/products/orisun-bracelet')
    expect(safeReturnPath('/search?q=beads')).toBe('/search?q=beads')
  })

  // The open-redirect battery: nothing may leave the site.
  it.each([
    ['absolute URL', 'https://evil.example'],
    ['scheme-relative', '//evil.example'],
    ['backslash cousin', '/\\evil.example'],
    ['embedded scheme', '/x://evil.example'],
    ['embedded backslash', '/x\\evil.example'],
    ['no leading slash', 'evil.example'],
    ['empty', ''],
    ['undefined', undefined],
    ['null', null],
  ])('collapses %s to /', (_label, raw) => {
    expect(safeReturnPath(raw as string)).toBe('/')
  })

  it('breaks the /gate → /gate loop', () => {
    expect(safeReturnPath('/gate')).toBe('/')
    expect(safeReturnPath('/gate?from=%2Fgate')).toBe('/')
  })

  it('drops absurd lengths instead of truncating', () => {
    expect(safeReturnPath('/' + 'a'.repeat(4096))).toBe('/')
  })
})
