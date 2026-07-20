import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const exchangeCodeForSession = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      exchangeCodeForSession: (...args: unknown[]) => exchangeCodeForSession(...args),
    },
  }),
}))

const { GET } = await import('@/app/auth/callback/route')

/** Builds a callback request against a fixed origin, with the given query params. */
function callbackRequest(params: Record<string, string>) {
  const url = new URL('http://localhost:3000/auth/callback')
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value)
  }
  return new NextRequest(url)
}

function locationOf(response: Response) {
  return response.headers.get('location')
}

describe('GET /auth/callback', () => {
  beforeEach(() => {
    exchangeCodeForSession.mockReset()
  })

  it('exchanges the code for a session and redirects to /account when next is absent', async () => {
    exchangeCodeForSession.mockResolvedValue({ data: {}, error: null })

    const response = await GET(callbackRequest({ code: 'auth-code-1' }))

    expect(exchangeCodeForSession).toHaveBeenCalledWith('auth-code-1')
    expect(locationOf(response)).toBe('http://localhost:3000/account')
  })

  it('redirects to the requested next path on success (the requestPasswordReset caller)', async () => {
    exchangeCodeForSession.mockResolvedValue({ data: {}, error: null })

    const response = await GET(callbackRequest({ code: 'auth-code-1', next: '/reset-password' }))

    expect(locationOf(response)).toBe('http://localhost:3000/reset-password')
  })

  it('redirects to /login with an error indicator when there is no code, without calling Supabase', async () => {
    const response = await GET(callbackRequest({}))

    expect(exchangeCodeForSession).not.toHaveBeenCalled()
    const location = locationOf(response)
    expect(location).toMatch(/^http:\/\/localhost:3000\/login\?error=/)
  })

  it('redirects to /login with an error indicator when exchangeCodeForSession fails', async () => {
    exchangeCodeForSession.mockResolvedValue({
      data: { session: null, user: null },
      error: { message: 'invalid flow state, no valid flow state found' },
    })

    const response = await GET(callbackRequest({ code: 'stale-code' }))

    const location = locationOf(response)
    expect(location).toMatch(/^http:\/\/localhost:3000\/login\?error=/)
  })

  describe('Fix 1 — the error indicator distinguishes a recovery-link failure', () => {
    it('uses error=auth (not recovery) for a non-recovery failure with no code', async () => {
      const response = await GET(callbackRequest({}))

      expect(locationOf(response)).toBe('http://localhost:3000/login?error=auth')
    })

    it('uses error=auth for a non-recovery exchange failure', async () => {
      exchangeCodeForSession.mockResolvedValue({
        data: { session: null, user: null },
        error: { message: 'invalid flow state, no valid flow state found' },
      })

      const response = await GET(callbackRequest({ code: 'stale-code' }))

      expect(locationOf(response)).toBe('http://localhost:3000/login?error=auth')
    })

    it('uses error=recovery when next=/reset-password and there is no code', async () => {
      const response = await GET(callbackRequest({ next: '/reset-password' }))

      expect(locationOf(response)).toBe('http://localhost:3000/login?error=recovery')
    })

    it('uses error=recovery when next=/reset-password and the exchange fails (an expired/used reset link)', async () => {
      exchangeCodeForSession.mockResolvedValue({
        data: { session: null, user: null },
        error: { message: 'invalid flow state, no valid flow state found' },
      })

      const response = await GET(callbackRequest({ code: 'stale-code', next: '/reset-password' }))

      expect(locationOf(response)).toBe('http://localhost:3000/login?error=recovery')
    })
  })

  describe('Fix 2 — the redirect base is env-derived, not the request Host', () => {
    it('redirects to NEXT_PUBLIC_SITE_URL even when the request origin looks attacker-controlled', async () => {
      // Simulates what `request.nextUrl.origin` would be if a reverse proxy
      // forwarded an unvalidated Host header. The route must not follow it.
      exchangeCodeForSession.mockResolvedValue({ data: {}, error: null })
      const url = new URL('http://evil.example/auth/callback')
      url.searchParams.set('code', 'auth-code-1')

      const response = await GET(new NextRequest(url))

      expect(locationOf(response)).toBe('http://localhost:3000/account')
    })

    it('builds the /login error redirect from the same env-derived base', async () => {
      const url = new URL('http://evil.example/auth/callback')

      const response = await GET(new NextRequest(url))

      expect(locationOf(response)).toBe('http://localhost:3000/login?error=auth')
    })
  })

  describe('open-redirect guard on next', () => {
    it.each([
      ['protocol-relative //', '//evil.com'],
      ['backslash variant', '/\\evil.com'],
      ['absolute URL with a scheme', 'https://evil.example/phish'],
    ])('falls back to /account instead of following next=%s (%s)', async (_label, next) => {
      exchangeCodeForSession.mockResolvedValue({ data: {}, error: null })

      const response = await GET(callbackRequest({ code: 'auth-code-1', next }))

      expect(locationOf(response)).toBe('http://localhost:3000/account')
    })
  })
})
