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
