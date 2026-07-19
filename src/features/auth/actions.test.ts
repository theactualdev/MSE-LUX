import { describe, it, expect, vi, beforeEach } from 'vitest'

// `redirect` is a control-flow throw in real Next.js (its return type is
// `never`). Mocking it to throw — rather than to just record a call — is
// what catches a missing early-return: forgetting to return after calling it
// would let execution fall through, and this mock makes that surface as a
// wrong assertion instead of silently passing.
const redirect = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`)
})

vi.mock('next/navigation', () => ({
  redirect: (url: string) => redirect(url),
}))

const signInWithPassword = vi.fn()
const signUp = vi.fn()
const signOut = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      signInWithPassword: (...args: unknown[]) => signInWithPassword(...args),
      signUp: (...args: unknown[]) => signUp(...args),
      signOut: (...args: unknown[]) => signOut(...args),
    },
  }),
}))

const { signIn, signUp: signUpAction, signOut: signOutAction } = await import('@/features/auth/actions')

describe('signIn', () => {
  beforeEach(() => {
    redirect.mockClear()
    signInWithPassword.mockReset()
  })

  it('calls signInWithPassword with the given credentials', async () => {
    signInWithPassword.mockResolvedValue({ data: {}, error: null })

    await signIn({ email: 'ada@example.com', password: 'abcdefgh' })

    expect(signInWithPassword).toHaveBeenCalledWith({ email: 'ada@example.com', password: 'abcdefgh' })
  })

  it('returns no error on success', async () => {
    signInWithPassword.mockResolvedValue({ data: {}, error: null })

    await expect(signIn({ email: 'ada@example.com', password: 'abcdefgh' })).resolves.toEqual({})
  })

  it('returns the Supabase error message on failure, without redirecting', async () => {
    signInWithPassword.mockResolvedValue({ data: {}, error: { message: 'Invalid login credentials' } })

    await expect(signIn({ email: 'ada@example.com', password: 'wrongpass' })).resolves.toEqual({
      error: 'Invalid login credentials',
    })
    expect(redirect).not.toHaveBeenCalled()
  })
})

const SIGNUP_VALUES = {
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  password: 'abcdefgh',
  confirmPassword: 'abcdefgh',
}

describe('signUp', () => {
  beforeEach(() => {
    redirect.mockClear()
    signUp.mockReset()
  })

  it('passes email/password plus the display name via options.data, and an emailRedirectTo callback URL', async () => {
    signUp.mockResolvedValue({ data: {}, error: null })

    await signUpAction(SIGNUP_VALUES)

    expect(signUp).toHaveBeenCalledWith({
      email: 'ada@example.com',
      password: 'abcdefgh',
      options: {
        data: { full_name: 'Ada Lovelace' },
        emailRedirectTo: expect.stringContaining('/auth/callback'),
      },
    })
  })

  it('returns no error on success', async () => {
    signUp.mockResolvedValue({ data: {}, error: null })

    await expect(signUpAction(SIGNUP_VALUES)).resolves.toEqual({})
  })

  it('returns the Supabase error message on failure', async () => {
    signUp.mockResolvedValue({ data: {}, error: { message: 'User already registered' } })

    await expect(signUpAction(SIGNUP_VALUES)).resolves.toEqual({ error: 'User already registered' })
  })
})

describe('signOut', () => {
  beforeEach(() => {
    redirect.mockClear()
    signOut.mockReset()
  })

  it('signs out then redirects to /', async () => {
    signOut.mockResolvedValue({ error: null })

    await expect(signOutAction()).rejects.toThrow('REDIRECT:/')
    expect(signOut).toHaveBeenCalled()
    expect(redirect).toHaveBeenCalledWith('/')
  })

  it('returns the error and does not redirect when sign-out fails', async () => {
    signOut.mockResolvedValue({ error: { message: 'Network error' } })

    await expect(signOutAction()).resolves.toEqual({ error: 'Network error' })
    expect(redirect).not.toHaveBeenCalled()
  })
})
