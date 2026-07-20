import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isSafeRedirectPath } from '@/features/auth/redirect-safety'
import { env } from '@/lib/env'
import type { CallbackErrorCode } from '@/features/auth/callback-errors'

/** Where a successful exchange lands when the caller didn't ask for anywhere specific. */
const DEFAULT_NEXT_PATH = '/account'

/**
 * The `next` value `requestPasswordReset`'s `redirectTo` sets (see
 * `actions.ts`) — the one signal this route has that a failing exchange was
 * a password-recovery attempt rather than an OAuth/signup one. Checked only
 * to pick *which fixed message* `/login` shows (`error=recovery` vs
 * `error=auth`, see `callback-errors.ts`); never used to build a URL, so it
 * carries none of the open-redirect risk `next` normally would, and reveals
 * nothing account-specific — a phishing link can set this query param just
 * as easily as a legitimate recovery email can, so the only thing this
 * distinction leaks is "this looked like a recovery attempt," which the
 * requester already knows.
 */
const RECOVERY_NEXT_PATH = '/reset-password'

/**
 * Builds every failure redirect. Same `/login` destination for both "no
 * code at all" and "Supabase rejected the code" — distinguishing *those* two
 * (as opposed to recovery-vs-not, see `RECOVERY_NEXT_PATH` above) would tell
 * a caller more than it needs to know about *why* the link didn't work, for
 * no benefit to a legitimate user.
 */
function loginErrorRedirect(base: string, code: CallbackErrorCode) {
  return NextResponse.redirect(new URL(`/login?error=${code}`, base))
}

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
 *
 * SECURITY — redirect base: every `new URL(..., base)` below resolves
 * against `env.NEXT_PUBLIC_SITE_URL`, never `request.nextUrl.origin`.
 * `origin` is derived from the request's `Host` header, which — behind a
 * proxy that forwards it unvalidated — is attacker-controlled; building the
 * `Location` header from it would let that attacker steer the redirect (this
 * route's own session cookie wouldn't follow, since it's set against the
 * real host, but there's no reason to depend on `Host` here at all when
 * `signInWithGoogle`, `signUp`, and `requestPasswordReset` already build
 * their callback URLs from `env.NEXT_PUBLIC_SITE_URL`). This also keeps the
 * open-redirect guard's own guarantee intact: `isSafeRedirectPath` resolves
 * `next` against a fixed `http://` base precisely so it gets the same WHATWG
 * "special scheme" normalisation this route's own resolution gets — see
 * `redirect-safety.ts`. `env.NEXT_PUBLIC_SITE_URL` is Zod-validated
 * (`z.url()`, `src/lib/env.ts`) to always be an absolute `http`/`https` URL,
 * so it stays in that same special-scheme class as `origin` was; swapping
 * the base doesn't break the equivalence the validator relies on.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const base = env.NEXT_PUBLIC_SITE_URL

  const code = searchParams.get('code')
  const rawNext = searchParams.get('next')
  const next = isSafeRedirectPath(rawNext) ? rawNext : DEFAULT_NEXT_PATH
  const errorCode: CallbackErrorCode = rawNext === RECOVERY_NEXT_PATH ? 'recovery' : 'auth'

  if (!code) {
    return loginErrorRedirect(base, errorCode)
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    return loginErrorRedirect(base, errorCode)
  }

  return NextResponse.redirect(new URL(next, base))
}
