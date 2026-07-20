import { describe, it, expect, vi, beforeEach } from 'vitest'
import { env } from '@/lib/env'

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
const resetPasswordForEmail = vi.fn()
const updateUser = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      signInWithPassword: (...args: unknown[]) => signInWithPassword(...args),
      signUp: (...args: unknown[]) => signUp(...args),
      signOut: (...args: unknown[]) => signOut(...args),
      resetPasswordForEmail: (...args: unknown[]) => resetPasswordForEmail(...args),
      updateUser: (...args: unknown[]) => updateUser(...args),
    },
  }),
}))

const {
  signIn,
  signUp: signUpAction,
  signOut: signOutAction,
  requestPasswordReset,
  updatePassword,
} = await import('@/features/auth/actions')

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

// `signUp`'s parameter type is `Omit<SignupValues, 'confirmPassword'>` — this
// fixture matches that shape exactly, since `confirmPassword` is a
// client-only RHF check the server never receives (see signup-form.tsx).
const SIGNUP_VALUES = {
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  password: 'abcdefgh',
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
        emailRedirectTo: `${env.NEXT_PUBLIC_SITE_URL}/auth/callback`,
      },
    })
    expect(redirect).not.toHaveBeenCalled()
  })

  it('returns no error on success', async () => {
    signUp.mockResolvedValue({ data: {}, error: null })

    await expect(signUpAction(SIGNUP_VALUES)).resolves.toEqual({})
    expect(redirect).not.toHaveBeenCalled()
  })

  it('returns the Supabase error message on failure', async () => {
    signUp.mockResolvedValue({ data: {}, error: { message: 'User already registered' } })

    await expect(signUpAction(SIGNUP_VALUES)).resolves.toEqual({ error: 'User already registered' })
    expect(redirect).not.toHaveBeenCalled()
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

describe('requestPasswordReset', () => {
  beforeEach(() => {
    resetPasswordForEmail.mockReset()
  })

  it('calls resetPasswordForEmail with the email and a callback redirectTo carrying next=/reset-password', async () => {
    resetPasswordForEmail.mockResolvedValue({ data: {}, error: null })

    await requestPasswordReset('ada@example.com')

    expect(resetPasswordForEmail).toHaveBeenCalledWith('ada@example.com', {
      redirectTo: `${env.NEXT_PUBLIC_SITE_URL}/auth/callback?next=/reset-password`,
    })
  })

  it('returns no error on success', async () => {
    resetPasswordForEmail.mockResolvedValue({ data: {}, error: null })

    await expect(requestPasswordReset('ada@example.com')).resolves.toEqual({})
  })

  it('returns the Supabase error message on failure', async () => {
    resetPasswordForEmail.mockResolvedValue({ data: {}, error: { message: 'Email rate limit exceeded' } })

    await expect(requestPasswordReset('ada@example.com')).resolves.toEqual({
      error: 'Email rate limit exceeded',
    })
  })

  it('rejects an invalid email without calling Supabase', async () => {
    await expect(requestPasswordReset('not-an-email')).resolves.toEqual({
      error: 'Enter a valid email address',
    })
    expect(resetPasswordForEmail).not.toHaveBeenCalled()
  })
})

describe('updatePassword', () => {
  beforeEach(() => {
    updateUser.mockReset()
  })

  it('calls updateUser with the new password', async () => {
    updateUser.mockResolvedValue({ data: {}, error: null })

    await updatePassword('newpassword1')

    expect(updateUser).toHaveBeenCalledWith({ password: 'newpassword1' })
  })

  it('returns no error on success', async () => {
    updateUser.mockResolvedValue({ data: {}, error: null })

    await expect(updatePassword('newpassword1')).resolves.toEqual({})
  })

  it('returns the Supabase error message on failure', async () => {
    updateUser.mockResolvedValue({ data: {}, error: { message: 'Auth session missing' } })

    await expect(updatePassword('newpassword1')).resolves.toEqual({
      error: 'Auth session missing',
    })
  })

  it('rejects a too-short password without calling Supabase', async () => {
    await expect(updatePassword('short')).resolves.toEqual({
      error: 'Please choose a stronger password',
    })
    expect(updateUser).not.toHaveBeenCalled()
  })
})
