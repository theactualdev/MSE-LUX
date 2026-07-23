'use server'

import { z } from 'zod'
import { db } from '@/lib/db'
import { getCurrentUserId } from '@/features/auth/claims'
import { Prisma } from '@/generated/prisma/client'
import type { WishlistMutationResult } from '@/features/wishlist/types'

/**
 * Per-user server wishlist: reads, mutations, and guest-wishlist merge for
 * signed-in customers. Guests keep their wishlist in `localStorage`
 * (`src/features/wishlist/store.ts`); this module only ever runs for a
 * session with a verified `sub` claim.
 *
 * The direct analog of `src/features/cart/data.ts` with quantity/inventory
 * removed — a wishlist line is just "this product id is saved", so there is
 * no quantity to clamp and no `ProductVariant`/`Product.inventory` lookup.
 * See that module's header for the full rationale this one shares:
 *
 * WHY THIS MODULE IS `'use server'` RATHER THAN `import 'server-only'`: the
 * two directives can't coexist — `'use server'` must be the literal first
 * statement of the module, so a `server-only` import above it would
 * conflict. `data.ts` is a Server Actions module instead of a plain
 * server-only one, so every export here is directly callable from the client
 * hook that Task 5 builds (no separate `actions.ts` wrapper, unlike
 * `src/features/account/`). That has one consequence worth being explicit
 * about: **every export of a `'use server'` module is a public HTTP
 * endpoint**, reachable by anyone who can reach this app, not just by code
 * that imports it — the same trust boundary `account/data.ts` describes for
 * its own actions. `WishlistMutationResult` lives in the sibling `types.ts`
 * (no directive) rather than being exported from here, because a
 * `'use server'` module may only export async functions — a `type` export
 * would violate that constraint.
 *
 * SECURITY — same authorization model as `cart/data.ts`: Prisma connects
 * through the pooler as a privileged role and bypasses RLS entirely, so every
 * filter below has to carry the profile id itself.
 *
 * 1. No function here accepts a caller-supplied user id. Each one calls
 *    `getCurrentUserId()` and derives scope from that.
 * 2. Wishlist rows are looked up by `profileId`, then item writes are scoped
 *    by the resulting `wishlistId` — `WishlistItem` has no `profileId`
 *    column of its own, only a `wishlistId` FK, so that's the only key
 *    available to a `deleteMany`/`upsert` filter once the wishlist has been
 *    resolved.
 *
 * Returns typed results rather than throwing, so a caller (e.g. a route
 * handler) can map them to fixed, non-revealing copy instead of leaking a
 * Prisma error.
 */

const UNAUTHENTICATED: WishlistMutationResult = { error: 'Please sign in to manage your wishlist.' }
const INVALID_INPUT: WishlistMutationResult = { error: 'Please check your wishlist and try again.' }
const GENERIC_ERROR: WishlistMutationResult = { error: 'Something went wrong. Please try again.' }

/** Prisma's unique-constraint violation. Matched structurally so this module needn't import the error class. */
function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002'
}

/** Prisma's "record to update/delete not found" error. Matched structurally for the same reason. */
function isRecordNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2025'
}

/**
 * Either the shared client or an interactive-transaction client — every
 * helper below is called from both a bare mutation (`removeWishlistItem`,
 * which doesn't need transactional atomicity) and from inside
 * `db.$transaction` (`addWishlistItem`, `mergeGuestWishlist`, where a
 * fetch-or-create Wishlist and its item write must commit or roll back
 * together).
 */
type DbOrTx = typeof db | Prisma.TransactionClient

const idSchema = z.string().min(1)
const guestIdsSchema = z.array(idSchema)

/**
 * The user's wishlist product ids, in a stable order. `WishlistItem` has no
 * `createdAt` column (only `Wishlist` does — see `prisma/schema.prisma`), so
 * `id` (a cuid, whose prefix is time-based) stands in as the closest
 * available proxy for insertion order — same convention as
 * `cart/data.ts`'s `readItems`.
 *
 * Filters `WishlistItem` by the relation (`wishlist.profileId`) directly
 * rather than resolving a `Wishlist` row first — one query instead of two,
 * and there is nothing to write here that would need the id itself.
 */
async function readIds(client: DbOrTx, userId: string): Promise<string[]> {
  const rows = await client.wishlistItem.findMany({
    where: { wishlist: { profileId: userId } },
    orderBy: { id: 'asc' },
    select: { productId: true },
  })

  return rows.map((row) => row.productId)
}

/**
 * Fetch-or-create the signed-in user's `Wishlist`. There is deliberately no
 * unique constraint on `Wishlist.profileId` to `upsert` against (the schema
 * only has `@@index([profileId])`), so this is a plain `findFirst` then
 * `create` — mirroring `cart/data.ts`'s `getOrCreateCartId` exactly,
 * including the same known concurrent-first-add race a follow-up migration
 * will close with a unique constraint. Callers that need this run it inside
 * `db.$transaction` together with the item write that follows, so a
 * concurrent call from the same user can't create two `Wishlist` rows and
 * then have each write land on a different one.
 */
async function getOrCreateWishlistId(client: DbOrTx, userId: string): Promise<string> {
  const existing = await client.wishlist.findFirst({ where: { profileId: userId }, select: { id: true } })
  if (existing) return existing.id

  const created = await client.wishlist.create({ data: { profileId: userId }, select: { id: true } })
  return created.id
}

/** The signed-in user's wishlist product ids. Empty when unauthenticated or the user has no wishlist yet. */
export async function getServerWishlistIds(): Promise<string[]> {
  const userId = await getCurrentUserId()
  if (!userId) return []

  return readIds(db, userId)
}

/**
 * Saves a product to the signed-in user's wishlist, creating the wishlist
 * itself if this is their first save. Upserts on the `(wishlistId,
 * productId)` unique with a no-op `update`, so saving an id that's already
 * there is idempotent — one row, not a duplicate and not an error.
 */
export async function addWishlistItem(productId: string): Promise<WishlistMutationResult> {
  const userId = await getCurrentUserId()
  if (!userId) return UNAUTHENTICATED

  const parsed = idSchema.safeParse(productId)
  if (!parsed.success) return INVALID_INPUT

  try {
    await db.$transaction(async (tx) => {
      const wishlistId = await getOrCreateWishlistId(tx, userId)
      await tx.wishlistItem.upsert({
        where: { wishlistId_productId: { wishlistId, productId: parsed.data } },
        create: { wishlistId, productId: parsed.data },
        update: {},
      })
    })
  } catch (error) {
    if (isUniqueViolation(error) || isRecordNotFound(error)) return GENERIC_ERROR
    throw error
  }

  return { ok: true, ids: await readIds(db, userId) }
}

/**
 * Removes one product from the signed-in user's wishlist. `deleteMany` (not
 * `delete`) scoped by the resolved `wishlistId`, mirroring
 * `cart/data.ts`'s `removeCartItem` convention — `WishlistItem` has no
 * `profileId` column to add to a `where`, so the wishlist must be resolved
 * to its id first and every item write scoped to that id.
 */
export async function removeWishlistItem(productId: string): Promise<WishlistMutationResult> {
  const userId = await getCurrentUserId()
  if (!userId) return UNAUTHENTICATED

  const parsed = idSchema.safeParse(productId)
  if (!parsed.success) return INVALID_INPUT

  const wishlist = await db.wishlist.findFirst({ where: { profileId: userId }, select: { id: true } })
  if (wishlist) {
    await db.wishlistItem.deleteMany({ where: { wishlistId: wishlist.id, productId: parsed.data } })
  }

  return { ok: true, ids: await readIds(db, userId) }
}

/**
 * Merges a guest (localStorage) wishlist into the signed-in user's server
 * wishlist: every guest id upserts on the `(wishlistId, productId)` unique
 * with a no-op `update`, so an id already saved on the server is left
 * untouched rather than duplicated — deduping is the unique constraint's
 * job, not this function's.
 *
 * All ids are written inside one `db.$transaction` (one fetch-or-create of
 * the wishlist, then one upsert per guest id) so the merge is all-or-nothing.
 * Reads the guest payload once and does not mutate it or any external store
 * — safe to call idempotently, per the interface contract: the caller (Task
 * 9) is expected to clear `localStorage` only after this resolves `ok`.
 */
export async function mergeGuestWishlist(ids: string[]): Promise<WishlistMutationResult> {
  const userId = await getCurrentUserId()
  if (!userId) return UNAUTHENTICATED

  const parsed = guestIdsSchema.safeParse(ids)
  if (!parsed.success) return INVALID_INPUT

  try {
    await db.$transaction(async (tx) => {
      const wishlistId = await getOrCreateWishlistId(tx, userId)

      for (const productId of parsed.data) {
        await tx.wishlistItem.upsert({
          where: { wishlistId_productId: { wishlistId, productId } },
          create: { wishlistId, productId },
          update: {},
        })
      }
    })
  } catch (error) {
    if (isUniqueViolation(error) || isRecordNotFound(error)) return GENERIC_ERROR
    throw error
  }

  return { ok: true, ids: await readIds(db, userId) }
}
