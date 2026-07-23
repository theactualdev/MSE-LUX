/**
 * Shared types between the server wishlist data layer (`data.ts`) and its
 * callers (the guest/server-wishlist hook Task 5 builds, `mergeGuestWishlist`'s
 * caller in Task 9).
 *
 * Deliberately a plain module with no `'use server'` or `server-only`
 * directive — same reasoning as `src/features/cart/types.ts`: `data.ts` is a
 * Server Actions module, and every export of a `'use server'` module must be
 * an async function, so a `type` export would violate that constraint. Types
 * are erased at compile time, so importing them into `data.ts` (or into
 * client components) carries no runtime cost and exposes nothing.
 */

/**
 * Result of a wishlist mutation. Never thrown — see `data.ts`'s header for
 * why — so callers always get either the fresh full id list to reconcile
 * local state against, or a fixed, non-revealing error string safe to show
 * as-is. Matches `useWishlistStore`'s `ids: string[]` shape
 * (`src/features/wishlist/store.ts`) so the unified hook Task 5 builds can
 * treat a guest id list and a server id list interchangeably.
 */
export type WishlistMutationResult = { ok: true; ids: string[] } | { error: string }
