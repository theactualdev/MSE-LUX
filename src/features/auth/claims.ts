import 'server-only'

import type { JwtPayload } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { Role } from '@/generated/prisma/client'

/**
 * `roleFromClaims` / `roleSatisfies` live in the directive-free
 * `@/features/auth/role` so the client's `use-session` hook can derive the
 * same role for header affordances without importing this `server-only`
 * module. Re-exported here because every existing caller (and the tests that
 * mock `@/features/auth/claims`) imports them from this path.
 *
 * On this side of the boundary they operate on claims whose JWT signature
 * `getClaims()` has verified, which is what makes them an authorization
 * decision here and only a rendering decision on the client.
 */
import { roleFromClaims } from '@/features/auth/role'
import type { ClaimsLike } from '@/features/auth/role'

export { roleFromClaims, roleSatisfies } from '@/features/auth/role'
export type { ClaimsLike } from '@/features/auth/role'

/**
 * How long a session's `recovery` authentication event stays trusted for
 * `updatePassword`. Chosen to comfortably cover reading the email, clicking
 * through, and typing a new password twice, while staying short enough that
 * a recovery session left open in a browser (kiosk, shared laptop) can't be
 * used to change the password long after the legitimate reset window —
 * verifyOtp/exchangeCodeForSession already caps how long the *link* itself
 * is valid, but nothing else bounds how long the *session* it produces goes
 * on being treated as "just came from a recovery link" without this check.
 */
const RECOVERY_AUTH_WINDOW_SECONDS = 15 * 60

/**
 * True when `claims` belongs to a session whose JWT records a `recovery`
 * authentication event (Supabase's `amr` claim) within the last
 * `windowSeconds`.
 *
 * SECURITY: this is what stands between `updatePassword`
 * (`src/features/auth/actions.ts`) and a silent, un-authenticated password
 * change. `supabase.auth.updateUser({ password })` acts on whatever session
 * cookie is present — it does not ask for the current password — so without
 * this check, *any* signed-in session (an ordinary browser login, left
 * unlocked on a shared machine) could overwrite the account's credential.
 * `/reset-password` has to be reachable by an ordinary authenticated session
 * too (it's not gated by `redirectIfAuthenticated()`, since Supabase's recovery link
 * establishes a session before the user ever lands there), so the route
 * alone can't tell the two apart — only the claims can.
 *
 * Empirically verified (no live Supabase project was available in this
 * environment, so this is based on the installed client's own types and
 * behaviour, plus Supabase's published JWT claims reference, rather than a
 * decoded token from a real recovery flow — flagged in the task report):
 * - `node_modules/@supabase/auth-js/src/lib/types.ts`'s `JwtPayload` defines
 *   `amr?: AMREntry[] | string[]`, and `AMREntry` is `{ method: AMRMethod;
 *   timestamp: number }` (seconds since epoch) — the "detailed format"
 *   variant, not the bare RFC-8176 string array.
 * - `GoTrueClient.getClaims()`'s own JSDoc example response returns `amr` in
 *   exactly that object shape (`[{ "method": "email", "timestamp": ... }]`),
 *   confirming `getClaims()` — the verified-JWT path this project requires
 *   over `getSession()` — surfaces it, not just the type definition.
 * - Supabase's JWT claims reference (supabase.com/docs/guides/auth/jwt-fields)
 *   lists `recovery` as a distinct recognised `amr` method value, separate
 *   from `otp` and `magiclink` — i.e. a session established via the
 *   password-recovery link is expected to carry a `recovery` entry, not just
 *   a generic `otp`/`magiclink` one that an ordinary passwordless login
 *   would also produce.
 * - Only the object `{ method, timestamp }` form is trusted here. The
 *   RFC-8176 string-array form the type also permits (e.g. `["recovery"]`)
 *   carries no timestamp, so freshness can't be checked against it — an
 *   unverifiable claim is treated as absent rather than trusted, per this
 *   file's existing "malformed claim never grants access" convention (see
 *   `roleFromClaims`).
 */
export function hasRecentRecoveryAuth(
  claims: ClaimsLike,
  windowSeconds: number = RECOVERY_AUTH_WINDOW_SECONDS,
): boolean {
  const amr = claims?.amr

  if (!Array.isArray(amr)) {
    return false
  }

  const nowSeconds = Date.now() / 1000

  return amr.some((entry) => {
    if (typeof entry !== 'object' || entry === null) {
      return false
    }

    const { method, timestamp } = entry as { method?: unknown; timestamp?: unknown }

    if (method !== 'recovery' || typeof timestamp !== 'number') {
      return false
    }

    const ageSeconds = nowSeconds - timestamp

    // Small negative tolerance for clock skew between this server and
    // Supabase's. A larger negative age means the timestamp is bogus, not
    // just skewed, so it is not treated as fresh either.
    return ageSeconds >= -60 && ageSeconds <= windowSeconds
  })
}

/**
 * Verified JWT claims for the current request, or `null` when there is no
 * session (or the token fails verification).
 *
 * Uses `supabase.auth.getClaims()`, which verifies the JWT signature against
 * Supabase's signing keys. Never use `supabase.auth.getSession()` here — it
 * reads the token out of storage without verifying it, so a tampered or
 * stale cookie would be trusted as-is.
 */
export async function getSessionClaims(): Promise<JwtPayload | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getClaims()

  if (error || !data) {
    return null
  }

  return data.claims
}

/** The current user's id (JWT `sub` claim), or `null` when unauthenticated. */
export async function getCurrentUserId(): Promise<string | null> {
  const claims = await getSessionClaims()
  return claims?.sub ?? null
}

/**
 * The current user's verified sign-in email (JWT `email` claim), or `null`
 * when unauthenticated.
 *
 * This is the email Supabase Auth actually authenticates against — distinct
 * from `Profile.email`, which is application data. Read this (not the
 * `Profile` row) anywhere the UI needs to show "the email you sign in with",
 * so a stored `Profile.email` that has gone stale (out-of-band edit, a
 * provisioning replay) can never be presented as the sign-in address.
 */
export async function getCurrentUserEmail(): Promise<string | null> {
  const claims = await getSessionClaims()
  return typeof claims?.email === 'string' ? claims.email : null
}

/** The current user's application role, defaulting to `CUSTOMER` when unauthenticated. */
export async function getCurrentRole(): Promise<Role> {
  const claims = await getSessionClaims()
  return roleFromClaims(claims)
}
