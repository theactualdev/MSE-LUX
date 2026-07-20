'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { env } from '@/lib/env'
import { getSessionClaims, hasRecentRecoveryAuth } from '@/features/auth/claims'
import {
  loginServerSchema,
  signupServerSchema,
  forgotSchema,
  resetServerSchema,
  type LoginValues,
  type SignupValues,
} from '@/features/account/schema'

/**
 * Result shape every action below returns instead of throwing, so the
 * calling form can surface `error` in its existing error region. `redirect()`
 * is the one deliberate exception — it throws by design (return type
 * `never`) and must never be wrapped in a try/catch that would swallow it.
 */
export interface AuthActionResult {
  error?: string
}

/**
 * Signs in with email + password. Never logs or persists the password.
 *
 * A `'use server'` export is a public HTTP endpoint: anyone can POST it
 * arbitrary JSON directly, bypassing the browser form entirely, so RHF's
 * `zodResolver` (which only ever runs client-side) buys no protection here
 * and the `LoginValues` parameter type is erased at runtime. Re-validating
 * server-side is the actual security boundary — but against
 * `loginServerSchema`, not the client's `loginSchema`: this is the
 * verify-password path, not the set-password path, so the only rule that
 * belongs here is "a password was supplied," not a strength rule like
 * `min(8)` that could reject a valid Supabase account (min 6) created
 * outside this form.
 */
export async function signIn(values: LoginValues): Promise<AuthActionResult> {
  const parsed = loginServerSchema.safeParse(values)
  if (!parsed.success) {
    return { error: 'Invalid email or password' }
  }
  const { email, password } = parsed.data

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    return { error: error.message }
  }

  return {}
}

/**
 * Creates a new account. The display name is passed through
 * `options.data` (lands in Supabase's `user_metadata` / `raw_user_meta_data`)
 * for DISPLAY only — the Profile-provisioning trigger reads it for the
 * initial name, but nothing here or downstream may use it for authorization.
 * Unvalidated, `name` would flow straight into `raw_user_meta_data` and then
 * the Task 2 trigger's `Profile` row bounded only by `signupServerSchema`
 * below (currently 1-100 characters), so it goes through that schema like
 * every other field.
 * `emailRedirectTo` points at the callback route Task 7 adds; until then the
 * confirmation link 404s, which is expected at this point in the build.
 *
 * Takes `{ name, email, password }` rather than the full `SignupValues` —
 * `confirmPassword` is a client-only UX check (RHF's `zodResolver` already
 * enforced the match before this was called) and has no reason to be sent
 * over the wire a second time. `signupServerSchema` mirrors that: it's
 * `signupSchema`'s field set minus `confirmPassword`, so re-validation here
 * checks exactly what the server actually received.
 */
export async function signUp({
  name,
  email,
  password,
}: Omit<SignupValues, 'confirmPassword'>): Promise<AuthActionResult> {
  const parsed = signupServerSchema.safeParse({ name, email, password })
  if (!parsed.success) {
    return { error: 'Please check your details and try again' }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.name },
      emailRedirectTo: `${env.NEXT_PUBLIC_SITE_URL}/auth/callback`,
    },
  })

  if (error) {
    return { error: error.message }
  }

  return {}
}

/**
 * Requests a password-reset email. Supabase's `resetPasswordForEmail`
 * resolves successfully whether or not the address has an account — it
 * doesn't error to signal "no such user" — which is exactly what the form's
 * "if an account exists" copy already assumes, so no extra enumeration
 * handling is needed here.
 *
 * `redirectTo` points at the callback route Task 7 adds, with
 * `next=/reset-password` so the callback knows to land the user back on the
 * reset screen after exchanging the recovery link for a session; until Task
 * 7 lands, the link 404s, which is expected at this point in the build.
 *
 * A Supabase-reported failure here returns a fixed, generic message rather
 * than `error.message` — GoTrue's per-address rate-limit response ("For
 * security purposes, you can only request this after N seconds") only
 * appears on a *repeat* request for an address, so passing it through would
 * let an attacker distinguish "this address has been requested before" from
 * a fresh one, undermining the same enumeration hygiene the form's "if an
 * account exists" copy is there for. `forgot-password-form.tsx` also
 * doesn't branch on `{ error }` at all for this action, for the same
 * reason — this return value only matters to non-form callers.
 */
export async function requestPasswordReset(email: string): Promise<AuthActionResult> {
  const parsed = forgotSchema.safeParse({ email })
  if (!parsed.success) {
    return { error: 'Enter a valid email address' }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${env.NEXT_PUBLIC_SITE_URL}/auth/callback?next=/reset-password`,
  })

  if (error) {
    return { error: 'Something went wrong. Please try again.' }
  }

  return {}
}

/** Fixed copy for every `updatePassword` failure — see the comment below for why. */
const RESET_LINK_INVALID_ERROR = 'This reset link is no longer valid. Request a new one and try again.'

/**
 * Sets a new password. Reachable only once the callback route (Task 7) has
 * exchanged Supabase's recovery link for a session, so `updateUser` here
 * acts on that session rather than taking a token as an argument.
 *
 * Takes just the new password, not `confirmPassword` — that's a client-only
 * RHF check `resetSchema`'s refine already enforced before this was called,
 * so `resetServerSchema` (the refine's base object minus `confirmPassword`)
 * is what gets re-validated here, mirroring `signUp`'s `signupServerSchema`
 * treatment.
 *
 * SECURITY — authorization, not just re-validation: `supabase.auth
 * .updateUser({ password })` acts on *whatever* session is present and never
 * asks for the current password, so it must not run against an ordinary
 * signed-in session — see `hasRecentRecoveryAuth` in `claims.ts` for the
 * full reasoning and how the `recovery` AMR claim was verified. `/reset
 * -password` is deliberately not wrapped in `RedirectIfAuthed` (Supabase's
 * recovery link signs the user in before they reach it), so an ordinary
 * authenticated visitor — e.g. an unlocked shared browser — can load this
 * screen; this check is what stops them from actually changing the
 * password from it.
 *
 * Every failure path here — no/stale recovery claim, or a genuine Supabase
 * `updateUser` error — returns the same fixed, non-revealing message.
 * Distinguishing them (e.g. echoing "Auth session missing") would tell a
 * caller *why* it failed, which is exactly the kind of detail an
 * unauthenticated or session-confused caller shouldn't get for a
 * credential-changing endpoint.
 */
export async function updatePassword(newPassword: string): Promise<AuthActionResult> {
  const parsed = resetServerSchema.safeParse({ password: newPassword })
  if (!parsed.success) {
    return { error: 'Please choose a stronger password' }
  }

  const claims = await getSessionClaims()
  if (!hasRecentRecoveryAuth(claims)) {
    return { error: RESET_LINK_INVALID_ERROR }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password })

  if (error) {
    return { error: RESET_LINK_INVALID_ERROR }
  }

  // Standard credential-rotation hygiene: invalidate every session for this
  // account (`scope: 'global'`, not just the current one), not merely the
  // recovery session that made this change — a password change should log
  // out every device signed in under the old credential. This is
  // best-effort: if it fails, the password change itself already succeeded,
  // so we still redirect rather than leaving the user on a dead success
  // panel or surfacing an error for something that in fact worked.
  await supabase.auth.signOut({ scope: 'global' })

  redirect('/login')
}

/** Clears the session, then redirects to `/` — the deliberate post-sign-out destination. */
export async function signOut(): Promise<AuthActionResult> {
  const supabase = await createClient()
  const { error } = await supabase.auth.signOut()

  if (error) {
    return { error: error.message }
  }

  redirect('/')
}
