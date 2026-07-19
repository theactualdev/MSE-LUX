import 'server-only'

import { notFound, redirect } from 'next/navigation'
import type { JwtPayload } from '@supabase/supabase-js'
import { Role } from '@/generated/prisma/client'
import { getSessionClaims, roleFromClaims, roleSatisfies } from '@/features/auth/claims'

/**
 * Establishes that the current request is authenticated, redirecting to
 * `/login` otherwise. Returns the verified claims for callers that need the
 * user id or role.
 *
 * `redirect()` throws by design (its return type is `never`) — do not wrap
 * this call, or any call to `requireUser`/`requireRole`, in a try/catch.
 */
export async function requireUser(): Promise<JwtPayload> {
  const claims = await getSessionClaims()

  if (!claims) {
    redirect('/login')
  }

  return claims
}

/**
 * Establishes that the current request is authenticated AND that the
 * caller's role satisfies `role` (see `roleSatisfies` for the hierarchy).
 *
 * Design decision: an insufficient role 404s via `notFound()` rather than
 * redirecting. `requireUser()` already handles the unauthenticated case by
 * redirecting to `/login`; by the time a role check can even run, the
 * caller is known to be signed in. Redirecting a signed-in customer to
 * `/login` (or to some "not authorized" page) confirms to them that the
 * route exists and is merely off-limits. `notFound()` gives no such
 * signal — an admin route under a customer session looks exactly like a
 * route that was never there, which is the correct posture for
 * authorization (as opposed to authentication) failures.
 */
export async function requireRole(role: Role): Promise<JwtPayload> {
  const claims = await requireUser()
  const actual = roleFromClaims(claims)

  if (!roleSatisfies(actual, role)) {
    notFound()
  }

  return claims
}
