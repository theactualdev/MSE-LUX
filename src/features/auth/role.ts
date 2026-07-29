import { Role } from '@/generated/prisma/enums'

/**
 * Pure role helpers, shared by the server guards and the client's header
 * affordances.
 *
 * Deliberately **directive-free**: `claims.ts` is `server-only`, but
 * `use-session.ts` needs the exact same `roleFromClaims` to decide whether to
 * render an Admin link. Duplicating the derivation into a client file would
 * put the security-critical `app_metadata`-only rule below in two places, free
 * to drift apart — so it lives here once and both sides import it.
 *
 * Imports `Role` from `@/generated/prisma/enums` rather than
 * `@/generated/prisma/client`: the enums module is plain const objects with no
 * imports of its own, so a client bundle pays nothing for it, whereas the
 * client entrypoint drags in the Prisma runtime.
 *
 * `claims.ts` re-exports `roleFromClaims` and `roleSatisfies`, so existing
 * server callers (and the tests that mock `@/features/auth/claims`) are
 * unaffected by this file's existence.
 */

/**
 * Loose shape accepted by the pure claim helpers below. Deliberately wider
 * than `JwtPayload` (which requires a full set of registered JWT claims) so
 * unit tests can exercise `roleFromClaims` with minimal literals, while still
 * being structurally compatible with the real `JwtPayload` returned by
 * `supabase.auth.getClaims()`.
 */
export type ClaimsLike =
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
 * Derives the caller's application role from JWT claims.
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
 *
 * SECURITY (client callers): on the server this runs against claims whose JWT
 * signature `getClaims()` has verified, and that is the only context in which
 * its result is an authorization decision. A client caller reads the same
 * claims out of a cookie the user can edit, so there it decides only what to
 * *render* — see `use-session.ts`.
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
