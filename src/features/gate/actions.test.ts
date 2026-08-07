import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const cookieSet = vi.fn()
vi.mock('next/headers', () => ({
  cookies: async () => ({ set: cookieSet }),
}))

/** Mirrors Next's real behaviour: `redirect` throws, so nothing after it runs. */
const redirect = vi.fn((to: string) => {
  throw new Error(`REDIRECT:${to}`)
})
vi.mock('next/navigation', () => ({ redirect: (to: string) => redirect(to) }))

const checkRateLimit = vi.fn()
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: (...args: unknown[]) => checkRateLimit(...args),
  RATE_LIMITED_MESSAGE: 'Too many attempts. Please wait a moment and try again.',
}))

const { enterStore } = await import('@/features/gate/actions')

const PASSWORD = 'launch-password-2026'

function form(entries: Record<string, string>): FormData {
  const data = new FormData()
  for (const [key, value] of Object.entries(entries)) data.set(key, value)
  return data
}

beforeEach(() => {
  vi.clearAllMocks()
  checkRateLimit.mockResolvedValue(true)
  process.env.SITE_PASSWORD = PASSWORD
})

afterEach(() => {
  delete process.env.SITE_PASSWORD
})

describe('enterStore', () => {
  it('correct password → sets the HttpOnly session cookie and redirects to the sanitized destination', async () => {
    await expect(enterStore({}, form({ password: PASSWORD, from: '/products/orisun-bracelet' }))).rejects.toThrow(
      'REDIRECT:/products/orisun-bracelet',
    )

    expect(cookieSet).toHaveBeenCalledTimes(1)
    const [name, value, options] = cookieSet.mock.calls[0]
    expect(name).toBe('mse_gate')
    // The cookie is a signed token, never the password or a bare flag.
    expect(value).not.toContain(PASSWORD)
    expect(value).toMatch(/^v1\.\d+\./)
    expect(options).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/' })
  })

  it('an open-redirect destination is collapsed to / at redemption', async () => {
    await expect(enterStore({}, form({ password: PASSWORD, from: '//evil.example' }))).rejects.toThrow('REDIRECT:/')
  })

  it('wrong password → generic error, no cookie, no redirect', async () => {
    const result = await enterStore({}, form({ password: 'guess', from: '/' }))

    expect(result).toEqual({ error: 'Incorrect password. Please try again.' })
    expect(cookieSet).not.toHaveBeenCalled()
    expect(redirect).not.toHaveBeenCalled()
  })

  it('rate limited → limiter copy, and the password is never even compared', async () => {
    checkRateLimit.mockResolvedValue(false)

    const result = await enterStore({}, form({ password: PASSWORD, from: '/' }))

    expect(result).toEqual({ error: 'Too many attempts. Please wait a moment and try again.' })
    expect(cookieSet).not.toHaveBeenCalled()
    expect(checkRateLimit).toHaveBeenCalledWith('gate')
  })

  // A direct POST while the gate is off must not reveal that it is off.
  it('SITE_PASSWORD unset → the same generic error as a wrong password', async () => {
    delete process.env.SITE_PASSWORD

    const result = await enterStore({}, form({ password: 'anything', from: '/' }))

    expect(result).toEqual({ error: 'Incorrect password. Please try again.' })
    expect(cookieSet).not.toHaveBeenCalled()
  })

  it.each([
    ['missing', {}],
    ['empty', { password: '' }],
    ['absurdly long', { password: 'x'.repeat(600) }],
  ])('malformed submission (%s) → generic error', async (_label, entries) => {
    const result = await enterStore({}, form(entries as Record<string, string>))

    expect(result).toEqual({ error: 'Incorrect password. Please try again.' })
    expect(cookieSet).not.toHaveBeenCalled()
  })
})
