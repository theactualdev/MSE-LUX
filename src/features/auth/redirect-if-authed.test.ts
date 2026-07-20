import { describe, it, expect, vi, beforeEach } from 'vitest'

// `redirect` is a control-flow throw in real Next.js. Mocking it to throw
// (rather than record) is what catches a missing early exit.
const redirect = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`)
})

vi.mock('next/navigation', () => ({
  redirect: (url: string) => redirect(url),
}))

const getSessionClaims = vi.fn()

vi.mock('@/features/auth/claims', () => ({
  getSessionClaims: () => getSessionClaims(),
}))

const { redirectIfAuthenticated } = await import('@/features/auth/redirect-if-authed')

beforeEach(() => {
  vi.clearAllMocks()
})

describe('redirectIfAuthenticated', () => {
  it('sends an already-signed-in visitor to /account', async () => {
    getSessionClaims.mockResolvedValue({ sub: 'user-1' })

    await expect(redirectIfAuthenticated()).rejects.toThrow('REDIRECT:/account')
  })

  it('lets an unauthenticated visitor through', async () => {
    getSessionClaims.mockResolvedValue(null)

    await expect(redirectIfAuthenticated()).resolves.toBeUndefined()
    expect(redirect).not.toHaveBeenCalled()
  })

  it('decides from verified claims, never from persisted client state', async () => {
    // The regression this replaced: updatePassword signs out globally and
    // redirects to /login, but the old client component read a *persisted*
    // mock user that survived that sign-out and bounced the user to /account
    // over a dead session. With claims as the only input, a cleared session
    // is unambiguously "let them through".
    getSessionClaims.mockResolvedValue(null)

    await expect(redirectIfAuthenticated()).resolves.toBeUndefined()
    expect(getSessionClaims).toHaveBeenCalledTimes(1)
  })
})
