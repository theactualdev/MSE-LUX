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
const getClaims = vi.fn()
const signInWithOAuth = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      signInWithPassword: (...args: unknown[]) => signInWithPassword(...args),
      signUp: (...args: unknown[]) => signUp(...args),
      signOut: (...args: unknown[]) => signOut(...args),
      resetPasswordForEmail: (...args: unknown[]) => resetPasswordForEmail(...args),
      updateUser: (...args: unknown[]) => updateUser(...args),
      getClaims: (...args: unknown[]) => getClaims(...args),
      signInWithOAuth: (...args: unknown[]) => signInWithOAuth(...args),
    },
  }),
}))

/** A claims payload with a fresh `recovery` AMR entry — the shape `updatePassword` requires. */
function recoveryClaims(overrides: { ageSeconds?: number; method?: string } = {}) {
  const { ageSeconds = 0, method = 'recovery' } = overrides
  return {
    data: {
      claims: {
        sub: 'user-1',
        amr: [{ method, timestamp: Date.now() / 1000 - ageSeconds }],
      },
    },
    error: null,
  }
}

const {
  signIn,
  signUp: signUpAction,
  signOut: signOutAction,
  requestPasswordReset,
  updatePassword,
  signInWithGoogle,
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

  it('returns a fixed generic error on failure, not the raw Supabase message, without redirecting', async () => {
    // Fix 3: GoTrue's raw message here is a credential-enumeration oracle
    // (e.g. distinguishing "no such user" from "wrong password") — matching
    // the fixed-copy convention `requestPasswordReset`/`updatePassword`
    // (Task 6) already use.
    signInWithPassword.mockResolvedValue({ data: {}, error: { message: 'Invalid login credentials' } })

    await expect(signIn({ email: 'ada@example.com', password: 'wrongpass' })).resolves.toEqual({
      error: 'Invalid email or password',
    })
    expect(redirect).not.toHaveBeenCalled()
  })

  it('returns the same fixed error for a local validation failure as for a Supabase failure', async () => {
    await expect(signIn({ email: 'not-an-email', password: '' })).resolves.toEqual({
      error: 'Invalid email or password',
    })
    expect(signInWithPassword).not.toHaveBeenCalled()
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

  it('returns a fixed generic error and does not redirect when sign-out fails', async () => {
    // Fix 3: matches the fixed-copy convention, not because this path is
    // especially sensitive.
    signOut.mockResolvedValue({ error: { message: 'Network error' } })

    await expect(signOutAction()).resolves.toEqual({
      error: 'Something went wrong. Please try again.',
    })
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

  it('returns a fixed generic error on failure, not the raw Supabase message', async () => {
    // GoTrue's rate-limit message only appears on a *repeat* request for an
    // address — passing it through would let a caller distinguish "this
    // address was requested before" from a fresh one, leaking exactly the
    // existence signal the form's "if an account exists" copy is meant to
    // hide.
    resetPasswordForEmail.mockResolvedValue({ data: {}, error: { message: 'Email rate limit exceeded' } })

    await expect(requestPasswordReset('ada@example.com')).resolves.toEqual({
      error: 'Something went wrong. Please try again.',
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
  const RESET_LINK_INVALID_ERROR = 'This reset link is no longer valid. Request a new one and try again.'

  beforeEach(() => {
    redirect.mockClear()
    updateUser.mockReset()
    signOut.mockReset()
    getClaims.mockReset()
  })

  it('calls updateUser with the new password when the session has a fresh recovery claim', async () => {
    getClaims.mockResolvedValue(recoveryClaims())
    updateUser.mockResolvedValue({ data: {}, error: null })
    signOut.mockResolvedValue({ error: null })

    await expect(updatePassword('newpassword1')).rejects.toThrow('REDIRECT:/login')

    expect(updateUser).toHaveBeenCalledWith({ password: 'newpassword1' })
  })

  it('signs out globally then redirects to /login on success', async () => {
    getClaims.mockResolvedValue(recoveryClaims())
    updateUser.mockResolvedValue({ data: {}, error: null })
    signOut.mockResolvedValue({ error: null })

    await expect(updatePassword('newpassword1')).rejects.toThrow('REDIRECT:/login')

    expect(signOut).toHaveBeenCalledWith({ scope: 'global' })
    expect(redirect).toHaveBeenCalledWith('/login')
  })

  it('returns a fixed generic error when updateUser fails, not the raw Supabase message', async () => {
    getClaims.mockResolvedValue(recoveryClaims())
    updateUser.mockResolvedValue({ data: {}, error: { message: 'Auth session missing' } })

    await expect(updatePassword('newpassword1')).resolves.toEqual({
      error: RESET_LINK_INVALID_ERROR,
    })
    expect(redirect).not.toHaveBeenCalled()
    expect(signOut).not.toHaveBeenCalled()
  })

  it('rejects a too-short password without calling Supabase', async () => {
    await expect(updatePassword('short')).resolves.toEqual({
      error: 'Please choose a stronger password',
    })
    expect(getClaims).not.toHaveBeenCalled()
    expect(updateUser).not.toHaveBeenCalled()
  })

  // Fix 6 — the security-critical case: a signed-in session that did NOT
  // come from Supabase's recovery link must never be able to call
  // updateUser at all, regardless of whether it holds a valid password.
  it('rejects a non-recovery session without calling updateUser', async () => {
    getClaims.mockResolvedValue(recoveryClaims({ method: 'password' }))

    await expect(updatePassword('newpassword1')).resolves.toEqual({
      error: RESET_LINK_INVALID_ERROR,
    })
    expect(updateUser).not.toHaveBeenCalled()
    expect(redirect).not.toHaveBeenCalled()
  })

  it('rejects an unauthenticated caller (no claims) without calling updateUser', async () => {
    getClaims.mockResolvedValue({ data: null, error: null })

    await expect(updatePassword('newpassword1')).resolves.toEqual({
      error: RESET_LINK_INVALID_ERROR,
    })
    expect(updateUser).not.toHaveBeenCalled()
  })

  it('rejects a stale recovery claim (outside the freshness window) without calling updateUser', async () => {
    getClaims.mockResolvedValue(recoveryClaims({ ageSeconds: 60 * 60 }))

    await expect(updatePassword('newpassword1')).resolves.toEqual({
      error: RESET_LINK_INVALID_ERROR,
    })
    expect(updateUser).not.toHaveBeenCalled()
  })
})

describe('signInWithGoogle', () => {
  beforeEach(() => {
    signInWithOAuth.mockReset()
  })

  it('requests the google provider with a redirectTo pointing at the callback route', async () => {
    signInWithOAuth.mockResolvedValue({
      data: { provider: 'google', url: 'https://accounts.google.com/o/oauth2/auth?...' },
      error: null,
    })

    await signInWithGoogle()

    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: {
        redirectTo: `${env.NEXT_PUBLIC_SITE_URL}/auth/callback`,
      },
    })
  })

  it('returns the provider URL for the client to navigate to on success', async () => {
    signInWithOAuth.mockResolvedValue({
      data: { provider: 'google', url: 'https://accounts.google.com/o/oauth2/auth?...' },
      error: null,
    })

    await expect(signInWithGoogle()).resolves.toEqual({
      url: 'https://accounts.google.com/o/oauth2/auth?...',
    })
  })

  it('returns a fixed generic error when Supabase reports a failure, not the raw message', async () => {
    signInWithOAuth.mockResolvedValue({
      data: { provider: 'google', url: null },
      error: { message: 'Provider not enabled' },
    })

    await expect(signInWithGoogle()).resolves.toEqual({
      error: 'Something went wrong. Please try again.',
    })
  })

  it('returns a fixed generic error when Supabase reports no error but also no URL', async () => {
    signInWithOAuth.mockResolvedValue({ data: { provider: 'google', url: null }, error: null })

    await expect(signInWithGoogle()).resolves.toEqual({
      error: 'Something went wrong. Please try again.',
    })
  })
})
