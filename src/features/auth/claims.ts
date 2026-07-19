import 'server-only'

import type { JwtPayload } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { Role } from '@/generated/prisma/client'

/**
 * Loose shape accepted by the pure claim helpers below. Deliberately wider
 * than `JwtPayload` (which requires a full set of registered JWT claims) so
 * unit tests can exercise `roleFromClaims` with minimal literals, while still
 * being structurally compatible with the real `JwtPayload` returned by
 * `supabase.auth.getClaims()`.
 */
type ClaimsLike =
  | ({
      // `Record<string, unknown>` rather than `{ role?: unknown }`: the real
      // `JwtPayload['app_metadata']` (`UserAppMetadata` from
      // @supabase/supabase-js) is defined with only an index signature, no
      // statically declared `role` key. TypeScript's "weak type" check
      // rejects assigning an index-signature-only type to a target that
      // consists solely of optional named properties, so `getSessionClaims`'s
      // real `JwtPayload` would fail to satisfy this type. An index-signature
      // target sidesteps that check while still letting `roleFromClaims`
      // narrow `role` itself with `isRole` below.
      app_metadata?: Record<string, unknown> | null
    } & Record<string, unknown>)
  | null
  | undefined

const ROLE_VALUES = new Set<string>(Object.values(Role))

function isRole(value: unknown): value is Role {
  return typeof value === 'string' && ROLE_VALUES.has(value)
}

/**
 * Derives the caller's application role from verified JWT claims.
 *
 * SECURITY: this reads `app_metadata.role` ONLY. Supabase's `user_metadata`
 * (`raw_user_meta_data`) can be edited by the end user themselves via the
 * client SDK — trusting a role stored there would let any customer promote
 * themselves to ADMIN or SUPER_ADMIN. `app_metadata` can only be written
 * from a trusted server context (service role / admin API), so it is the
 * only source of truth for authorization. Do not widen this to read
 * `user_metadata` under any circumstance.
 *
 * An absent or unrecognised role value defaults to `CUSTOMER` rather than
 * being trusted, so a malformed or tampered claim can never grant elevated
 * access.
 */
export function roleFromClaims(claims: ClaimsLike): Role {
  const role = claims?.app_metadata?.role
  return isRole(role) ? role : Role.CUSTOMER
}

const ROLE_RANK: Record<Role, number> = {
  [Role.CUSTOMER]: 0,
  [Role.ADMIN]: 1,
  [Role.SUPER_ADMIN]: 2,
}

/** `SUPER_ADMIN > ADMIN > CUSTOMER` — each role satisfies itself and everything below it. */
export function roleSatisfies(actual: Role, required: Role): boolean {
  return ROLE_RANK[actual] >= ROLE_RANK[required]
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

/** The current user's application role, defaulting to `CUSTOMER` when unauthenticated. */
export async function getCurrentRole(): Promise<Role> {
  const claims = await getSessionClaims()
  return roleFromClaims(claims)
}
