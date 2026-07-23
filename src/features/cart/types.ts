/**
 * Shared types between the server cart data layer (`data.ts`) and its
 * callers (the guest/server-cart hook in a later task, `mergeGuestCart`'s
 * caller in Task 9).
 *
 * Deliberately a plain module with no `'use server'` or `server-only`
 * directive: `data.ts` is a Server Actions module, and every export of a
 * `'use server'` module must be an async function — a `type` export would
 * violate that constraint. Types are erased at compile time, so importing
 * them into `data.ts` (or into client components) carries no runtime cost
 * and exposes nothing.
 */

/**
 * One cart line in the domain shape both the server cart and the guest
 * (localStorage) cart use. Matches `CartItem` in `src/features/cart/store.ts`
 * exactly, so the unified hook can treat a guest line and a server line
 * interchangeably.
 *
 * `variantId` is `undefined` for a variantless product — never `null`. The
 * database stores `NULL` in that column; `data.ts` converts at the boundary
 * so nothing outside it has to think about the two ways of spelling "no
 * variant".
 */
export type GuestCartItem = {
  productId: string
  variantId?: string
  quantity: number
}

/**
 * Result of a cart mutation. Never thrown — see `data.ts`'s header for why —
 * so callers always get either the fresh full item list to reconcile local
 * state against, or a fixed, non-revealing error string safe to show as-is.
 */
export type CartMutationResult = { ok: true; items: GuestCartItem[] } | { error: string }
