import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Role } from '@/generated/prisma/client'

// `redirect`/`notFound` are control-flow throws in real Next.js (their
// return type is `never`). Mocking them to throw — rather than to just
// record a call — is what catches the real bug class here: forgetting a
// `return`/early-exit after calling one would let execution fall through to
// use claims that don't exist, and these mocks make that surface as a wrong
// assertion instead of silently passing.
const redirect = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`)
})
const notFound = vi.fn(() => {
  throw new Error('NOT_FOUND')
})

vi.mock('next/navigation', () => ({
  redirect: (url: string) => redirect(url),
  notFound: () => notFound(),
}))

const getSessionClaims = vi.fn()

vi.mock('@/features/auth/claims', async () => {
  const actual = await vi.importActual<typeof import('@/features/auth/claims')>('@/features/auth/claims')
  return {
    ...actual,
    getSessionClaims: () => getSessionClaims(),
  }
})

const { requireUser, requireRole } = await import('@/features/auth/guards')

describe('requireUser', () => {
  beforeEach(() => {
    redirect.mockClear()
    notFound.mockClear()
    getSessionClaims.mockReset()
  })

  it('redirects to /login when there is no session', async () => {
    getSessionClaims.mockResolvedValue(null)

    await expect(requireUser()).rejects.toThrow('REDIRECT:/login')
    expect(redirect).toHaveBeenCalledWith('/login')
  })

  it('returns the claims when authenticated', async () => {
    const claims = { sub: 'user-1', app_metadata: { role: 'CUSTOMER' } }
    getSessionClaims.mockResolvedValue(claims)

    await expect(requireUser()).resolves.toBe(claims)
    expect(redirect).not.toHaveBeenCalled()
  })
})

describe('requireRole', () => {
  beforeEach(() => {
    redirect.mockClear()
    notFound.mockClear()
    getSessionClaims.mockReset()
  })

  it('redirects to /login (not a 404) when unauthenticated', async () => {
    getSessionClaims.mockResolvedValue(null)

    await expect(requireRole(Role.ADMIN)).rejects.toThrow('REDIRECT:/login')
    expect(notFound).not.toHaveBeenCalled()
  })

  it('404s when authenticated but the role is insufficient', async () => {
    getSessionClaims.mockResolvedValue({ sub: 'user-1', app_metadata: { role: 'CUSTOMER' } })

    await expect(requireRole(Role.ADMIN)).rejects.toThrow('NOT_FOUND')
    expect(redirect).not.toHaveBeenCalled()
  })

  it('returns the claims when the role matches exactly', async () => {
    const claims = { sub: 'admin-1', app_metadata: { role: 'ADMIN' } }
    getSessionClaims.mockResolvedValue(claims)

    await expect(requireRole(Role.ADMIN)).resolves.toBe(claims)
  })

  it('SUPER_ADMIN satisfies a lower ADMIN requirement', async () => {
    const claims = { sub: 'super-1', app_metadata: { role: 'SUPER_ADMIN' } }
    getSessionClaims.mockResolvedValue(claims)

    await expect(requireRole(Role.ADMIN)).resolves.toBe(claims)
  })

  it('ADMIN does not satisfy a SUPER_ADMIN requirement', async () => {
    getSessionClaims.mockResolvedValue({ sub: 'admin-1', app_metadata: { role: 'ADMIN' } })

    await expect(requireRole(Role.SUPER_ADMIN)).rejects.toThrow('NOT_FOUND')
  })

  it('CUSTOMER (default role) does not satisfy a CUSTOMER-or-above check beyond itself', async () => {
    getSessionClaims.mockResolvedValue({ sub: 'user-1', app_metadata: {} })

    await expect(requireRole(Role.CUSTOMER)).resolves.toMatchObject({ sub: 'user-1' })
  })
})
