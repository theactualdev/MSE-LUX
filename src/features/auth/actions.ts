'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { env } from '@/lib/env'
import { loginSchema, signupSchema, type LoginValues, type SignupValues } from '@/features/account/schema'

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
 * with the same `loginSchema` server-side is the actual security boundary.
 */
export async function signIn(values: LoginValues): Promise<AuthActionResult> {
  const parsed = loginSchema.safeParse(values)
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
 * the Task 2 trigger's `Profile` row with no length or content bound, so it
 * goes through `signupSchema` below like every other field.
 * `emailRedirectTo` points at the callback route Task 7 adds; until then the
 * confirmation link 404s, which is expected at this point in the build.
 *
 * Takes `{ name, email, password }` rather than the full `SignupValues` —
 * `confirmPassword` is a client-only UX check (RHF's `zodResolver` already
 * enforced the match before this was called) and has no reason to be sent
 * over the wire a second time. `signupSchema` still requires it, so it's
 * synthesized from `password` below purely to satisfy the schema's shape.
 */
export async function signUp({
  name,
  email,
  password,
}: Omit<SignupValues, 'confirmPassword'>): Promise<AuthActionResult> {
  const parsed = signupSchema.safeParse({ name, email, password, confirmPassword: password })
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

/** Clears the session, then redirects to `/` — the deliberate post-sign-out destination. */
export async function signOut(): Promise<AuthActionResult> {
  const supabase = await createClient()
  const { error } = await supabase.auth.signOut()

  if (error) {
    return { error: error.message }
  }

  redirect('/')
}
