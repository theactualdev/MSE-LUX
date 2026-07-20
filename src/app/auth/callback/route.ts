import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isSafeRedirectPath } from '@/features/auth/redirect-safety'

/** Where a successful exchange lands when the caller didn't ask for anywhere specific. */
const DEFAULT_NEXT_PATH = '/account'

/**
 * Where every failure mode below lands. Deliberately the same fixed path for
 * "no code at all" and "Supabase rejected the code" — distinguishing them in
 * the destination (or in copy sourced from `error.message`) would tell a
 * caller more than it needs to know about *why* the link didn't work, for no
 * benefit to a legitimate user (the actionable response — request a new
 * link, or try signing in again — is identical either way).
 */
const LOGIN_ERROR_PATH = '/login?error=auth'

/**
 * Exchanges a Supabase auth code (from an OAuth provider redirect, an email
 * confirmation link, or — critically — a password-recovery link) for a
 * session, then redirects onward.
 *
 * This single route is the landing point for three distinct callers already
 * wired up to it:
 * - `signInWithGoogle` (this task): Google's consent screen redirects here.
 * - `signUp`'s `emailRedirectTo` (Task 5): the signup confirmation email.
 * - `requestPasswordReset`'s `redirectTo` (Task 6): the recovery email,
 *   carrying `?next=/reset-password` so the visitor lands back on the
 *   reset-password screen with a fresh session afterward.
 *
 * SECURITY — recovery sessions: `exchangeCodeForSession` is called exactly
 * once, with no side channel that could re-establish or otherwise alter the
 * resulting session. Whatever `amr` entry GoTrue attaches server-side to the
 * session it mints for this code (an ordinary sign-in `amr` for the OAuth/
 * signup callers, or `recovery` for the password-recovery caller — see
 * `hasRecentRecoveryAuth` in `claims.ts` for how that distinction is later
 * enforced) is exactly what `updatePassword` sees afterward. This route must
 * stay that simple: layering any additional auth call on top here (e.g. a
 * second sign-in) would risk overwriting or masking that claim.
 *
 * SECURITY — open redirect: `next` is attacker-controllable query-string
 * input (a phishing link can read `?next=` just as easily as a legitimate
 * caller can set it), and this redirect fires with a real, freshly
 * authenticated session cookie already attached to the response — exactly
 * the payload an open redirect to an attacker's domain would hand over. See
 * `isSafeRedirectPath` for the validation itself; here it's reject-and-fall
 * -back to `DEFAULT_NEXT_PATH`, never pass the raw value through.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl

  const code = searchParams.get('code')
  const rawNext = searchParams.get('next')
  const next = isSafeRedirectPath(rawNext) ? rawNext : DEFAULT_NEXT_PATH

  if (!code) {
    return NextResponse.redirect(new URL(LOGIN_ERROR_PATH, origin))
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    return NextResponse.redirect(new URL(LOGIN_ERROR_PATH, origin))
  }

  return NextResponse.redirect(new URL(next, origin))
}
