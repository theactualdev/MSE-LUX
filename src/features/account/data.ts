import 'server-only'

import { db } from '@/lib/db'
import { getCurrentUserEmail, getCurrentUserId } from '@/features/auth/claims'
import type { Address } from '@/features/checkout/schema'

/**
 * Per-user profile and address reads/writes for the customer dashboard.
 *
 * SECURITY — this module is the authorization boundary for account data.
 * Prisma connects to Supabase through the pooler as a privileged role, so it
 * **bypasses RLS entirely**; the owner-scoped policies added in Task 7 are
 * defence-in-depth for other clients, not for this code path. That means
 * every filter below has to carry the profile id itself.
 *
 * Two rules follow from that, and both are load-bearing:
 *
 * 1. **No function here accepts a caller-supplied user id.** Each one calls
 *    `getCurrentUserId()` (verified JWT `sub`, via `getClaims()`) and derives
 *    the scope from that. There is deliberately no `userId` parameter to get
 *    wrong, and no overload that takes one — a Server Action is a public HTTP
 *    endpoint, so any id that arrived over the wire is attacker-controlled.
 *
 * 2. **Single-row writes go through `updateMany`/`deleteMany`, not
 *    `update`/`delete`.** Prisma's `update({ where: { id } })` only accepts
 *    unique fields in `where`, so `profileId` cannot be added to it — the
 *    ownership check would have to be a separate `findFirst` with a TOCTOU
 *    gap between check and write. `updateMany`/`deleteMany` take an arbitrary
 *    filter, so `{ id, profileId }` is enforced atomically by the database in
 *    the same statement that writes: another user's row simply matches zero
 *    rows and `count === 0` reports not-found.
 *
 * Returns typed results rather than throwing, so the Server Actions in
 * `actions.ts` can map them to fixed, non-revealing copy.
 */

/** Profile fields the dashboard renders. Deliberately excludes `role` — display code has no business branching on it. */
export interface AccountProfile {
  id: string
  name: string
  email: string
  phone: string
}

/** A stored address plus the two columns the UI needs beyond the shared `Address` shape. */
export type SavedAddress = Address & { id: string; isDefault: boolean }

/**
 * Why a discriminated result instead of `boolean` or a thrown error: the
 * caller (a Server Action) has to distinguish "not signed in" (redirect) from
 * "not yours / gone" (refresh the list) from "two writers collided" from
 * "you've hit the address cap", but must never leak Prisma's own error text.
 * A closed set of reason codes gives the action exactly enough to choose
 * copy and nothing more.
 */
export type MutationResult =
  | { ok: true }
  | { ok: false; reason: 'unauthenticated' | 'not-found' | 'conflict' | 'limit-reached' }

/**
 * Per-profile cap on saved addresses. `addAddress` is a public authenticated
 * Server Action writing straight to Postgres, so without a limit a single
 * caller could store an unbounded number of rows. 20 comfortably covers every
 * legitimate case this app has (home/work/gift addresses, a few relatives)
 * while keeping the ceiling far below anything that would matter for storage
 * or list-rendering cost.
 */
export const MAX_ADDRESSES_PER_PROFILE = 20

const UNAUTHENTICATED = { ok: false, reason: 'unauthenticated' } as const
const NOT_FOUND = { ok: false, reason: 'not-found' } as const
const CONFLICT = { ok: false, reason: 'conflict' } as const
const LIMIT_REACHED = { ok: false, reason: 'limit-reached' } as const
const OK = { ok: true } as const

/** Prisma's unique-constraint violation. Matched structurally so this module needn't import the error class. */
function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002'
}

/** Prisma's "record to update/delete not found" error. Matched structurally for the same reason. */
function isRecordNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2025'
}

/**
 * The DB stores optional text as `null`; the forms bind to `string`. Convert
 * at the boundary in both directions so neither side has to think about it
 * (`?? ''` on read, `|| null` on write) — an empty input must clear the
 * column, not store `''`.
 */
function toFormValue(value: string | null | undefined): string {
  return value ?? ''
}

function toColumnValue(value: string | undefined): string | null {
  return value?.trim() ? value.trim() : null
}

/**
 * The current user's profile, or `null` when unauthenticated.
 *
 * `email` comes from the verified JWT (`getCurrentUserEmail()`), not from the
 * `Profile.email` column — that's the address Supabase Auth actually signs
 * the user in with, and the only one this dashboard displays. See
 * `updateProfile` for why `Profile.email` is no longer writable from here.
 *
 * Also returns `null` if the row is missing. Task 2's `auth.users` trigger
 * provisions a `Profile` for every signup, so in practice a signed-in user
 * always has one — but a trigger that failed, or a user created out-of-band
 * (Supabase dashboard, SQL insert), would otherwise crash the dashboard on a
 * property access. Callers render the empty/fallback state instead.
 */
export async function getProfile(): Promise<AccountProfile | null> {
  const userId = await getCurrentUserId()
  if (!userId) return null

  const [row, email] = await Promise.all([
    db.profile.findUnique({
      where: { id: userId },
      select: { id: true, name: true, phone: true },
    }),
    getCurrentUserEmail(),
  ])

  if (!row) return null

  return {
    id: row.id,
    name: toFormValue(row.name),
    email: email ?? '',
    phone: toFormValue(row.phone),
  }
}

/**
 * Patches the signed-in user's profile.
 *
 * `email` is deliberately not a parameter: `Profile.email` is `@unique` and
 * the `auth.users` provisioning trigger (`handle_new_user()`) inserts new
 * profiles with an untargeted `ON CONFLICT DO NOTHING`, which absorbs a
 * conflict on that unique email exactly as silently as one on `id`. A caller
 * able to point `Profile.email` at another address could permanently starve
 * that address's future signup of a `Profile` row. Changing the address a
 * user signs in with is a separate, out-of-scope flow
 * (`updateUser({ email })` plus a confirmation round-trip to both the old and
 * new address) — this column is now read-only from the application. See
 * `getProfile` for what the dashboard displays instead.
 *
 * Catches `P2025` (row missing — reachable if the trigger never ran, or the
 * row was removed out-of-band between the route guard and this write) and
 * reports it rather than throwing out of the action.
 */
export async function updateProfile(patch: {
  name: string
  phone?: string
}): Promise<MutationResult> {
  const userId = await getCurrentUserId()
  if (!userId) return UNAUTHENTICATED

  try {
    await db.profile.update({
      where: { id: userId },
      // Fields are listed explicitly rather than spread from `patch`: this is
      // the last hop before the database, and an explicit projection is what
      // guarantees a smuggled `role`, `id`, or `email` key can never reach
      // `data`.
      data: {
        name: patch.name.trim(),
        phone: toColumnValue(patch.phone),
      },
    })
  } catch (error) {
    if (isRecordNotFound(error)) return NOT_FOUND
    throw error
  }

  return OK
}

/** The signed-in user's saved addresses, default first then oldest first. Empty when unauthenticated. */
export async function listAddresses(): Promise<SavedAddress[]> {
  const userId = await getCurrentUserId()
  if (!userId) return []

  const rows = await db.address.findMany({
    where: { profileId: userId },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
  })

  return rows.map((row) => ({
    id: row.id,
    isDefault: row.isDefault,
    fullName: row.fullName,
    phone: row.phone,
    line1: row.line1,
    line2: toFormValue(row.line2),
    city: row.city,
    state: row.state,
    country: row.country,
    postalCode: toFormValue(row.postalCode),
  }))
}

/**
 * Adds an address for the signed-in user. The very first address becomes the
 * default (mirroring the behaviour the mock store had).
 *
 * The count and the insert share a transaction, but — correction from an
 * earlier version of this comment — that transaction does NOT by itself stop
 * two concurrent "first" inserts from both seeing zero and both claiming
 * `isDefault`. Prisma's `$transaction` runs at Postgres's default READ
 * COMMITTED isolation, under which two concurrent transactions can both
 * `count()` zero before either commits. What actually prevents two default
 * rows for one profile is the `Address_one_default_per_profile` partial
 * unique index: the second insert's commit is rejected with `P2002`, caught
 * below and reported as `conflict` rather than left to throw out of the
 * action. The transaction's real job is only to keep the count and the
 * insert atomic with respect to *other* statements (e.g. a concurrent
 * delete), not to serialize concurrent inserts against each other.
 *
 * Also enforces `MAX_ADDRESSES_PER_PROFILE`, in the same transaction as the
 * count used for the default flag, so the two checks read a consistent
 * snapshot.
 */
export async function createAddress(input: Address): Promise<MutationResult> {
  const userId = await getCurrentUserId()
  if (!userId) return UNAUTHENTICATED

  try {
    return await db.$transaction(async (tx) => {
      const existing = await tx.address.count({ where: { profileId: userId } })

      if (existing >= MAX_ADDRESSES_PER_PROFILE) return LIMIT_REACHED

      await tx.address.create({
        data: {
          profileId: userId,
          isDefault: existing === 0,
          fullName: input.fullName,
          phone: input.phone,
          line1: input.line1,
          line2: toColumnValue(input.line2),
          city: input.city,
          state: input.state,
          country: input.country,
          postalCode: toColumnValue(input.postalCode),
        },
      })

      return OK
    })
  } catch (error) {
    if (isUniqueViolation(error)) return CONFLICT
    throw error
  }
}

/**
 * Edits one of the signed-in user's addresses.
 *
 * `updateMany` (not `update`) so `profileId` is part of the same filter as
 * `id` — see this module's header for why that matters. `data` is an explicit
 * projection of the address fields only: `isDefault` is owned by
 * `setDefaultAddress` (which has to maintain the partial unique index) and
 * `profileId` must never be writable at all, so neither is reachable from a
 * patch even if a hand-crafted request includes them.
 */
export async function updateAddress(id: string, patch: Address): Promise<MutationResult> {
  const userId = await getCurrentUserId()
  if (!userId) return UNAUTHENTICATED

  const { count } = await db.address.updateMany({
    where: { id, profileId: userId },
    data: {
      fullName: patch.fullName,
      phone: patch.phone,
      line1: patch.line1,
      line2: toColumnValue(patch.line2),
      city: patch.city,
      state: patch.state,
      country: patch.country,
      postalCode: toColumnValue(patch.postalCode),
    },
  })

  return count > 0 ? OK : NOT_FOUND
}

/**
 * Removes one of the signed-in user's addresses, promoting the oldest
 * remaining one to default if the deleted row held that flag — otherwise a
 * user could end up with saved addresses but no default, which checkout has
 * no sensible fallback for.
 *
 * The ownership read, the delete, and the promotion share one transaction so
 * a concurrent delete can't leave the profile with zero defaults. `findFirst`
 * here is scoped by `{ id, profileId }` too: its result decides whether to
 * promote, so it is as much an authorization filter as the delete's own.
 */
export async function deleteAddress(id: string): Promise<MutationResult> {
  const userId = await getCurrentUserId()
  if (!userId) return UNAUTHENTICATED

  return db.$transaction(async (tx) => {
    const target = await tx.address.findFirst({
      where: { id, profileId: userId },
      select: { id: true, isDefault: true },
    })

    if (!target) return NOT_FOUND

    await tx.address.deleteMany({ where: { id, profileId: userId } })

    if (target.isDefault) {
      const next = await tx.address.findFirst({
        where: { profileId: userId },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      })

      if (next) {
        await tx.address.updateMany({
          where: { id: next.id, profileId: userId },
          data: { isDefault: true },
        })
      }
    }

    return OK
  })
}

/**
 * Makes one of the signed-in user's addresses the default.
 *
 * The clear-then-set order is required, not stylistic:
 * `Address_one_default_per_profile` is a partial unique index on
 * `("profileId") WHERE "isDefault"` (hand-added SQL, invisible to Prisma —
 * see the schema comment on `Address.isDefault`). Setting the new default
 * before clearing the old one puts two rows with `isDefault = true` under the
 * same `profileId` for the duration of the statement, which the index rejects
 * outright. Both statements share a transaction so the intermediate
 * zero-default state is never observable, and a failure of either rolls the
 * pair back rather than leaving the profile with no default.
 *
 * Ownership is established first, inside the same transaction, because the
 * actual set uses `update({ where: { id } })` — Prisma won't accept a
 * non-unique `profileId` alongside a unique `id` there, so unlike
 * `updateAddress` the check can't be folded into the write itself. Holding
 * both in one transaction closes the gap that would otherwise open between
 * them.
 *
 * That gap isn't fully closed, though: under READ COMMITTED, a concurrent
 * delete of this same row can commit between the ownership `findFirst` and
 * the `update` below, which then raises `P2025` ("record to update not
 * found"). Caught and reported as `not-found` rather than left to throw —
 * the row genuinely is gone by the time the write runs, which is exactly
 * what `not-found` means to callers of this function. Not an authorization
 * hole: `profileId` is never writable by application code, so a row cannot
 * change owners between the check and the write, only disappear.
 */
export async function setDefaultAddress(id: string): Promise<MutationResult> {
  const userId = await getCurrentUserId()
  if (!userId) return UNAUTHENTICATED

  return db.$transaction(async (tx) => {
    const owned = await tx.address.findFirst({
      where: { id, profileId: userId },
      select: { id: true },
    })

    if (!owned) return NOT_FOUND

    await tx.address.updateMany({
      where: { profileId: userId, isDefault: true },
      data: { isDefault: false },
    })

    try {
      await tx.address.update({
        where: { id },
        data: { isDefault: true },
      })
    } catch (error) {
      if (isRecordNotFound(error)) return NOT_FOUND
      throw error
    }

    return OK
  })
}
