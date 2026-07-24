'use client'

import { useCallback, useEffect, useTransition } from 'react'
import { useSession } from '@/features/auth/use-session'
import { useWishlistStore } from '@/features/wishlist/store'
import { useServerWishlistStore } from '@/features/wishlist/server-wishlist-store'

export interface UseWishlistResult {
  ids: string[]
  has: (id: string) => boolean
  toggle: (id: string) => void
  count: number
  isPending: boolean
  isLoading: boolean
}

/**
 * Unified wishlist hook that hides the guest-vs-signed-in storage split from
 * every consumer (product card heart button, wishlist page, …). The
 * wishlist analog of `useCart` (`src/features/cart/use-cart.ts`) with
 * quantity/inventory and product-line resolution removed — a wishlist line
 * is just "this product id is saved", so `ids` (never full products) is all
 * either backend deals in. See that hook's header for the full rationale
 * this one shares.
 *
 * - **Guest** (`useSession().signedIn === false`): a thin proxy over
 *   `useWishlistStore` (localStorage). Behaves exactly like the store did
 *   before this hook existed — `isPending` is always `false`, nothing async
 *   happens, no server action is called.
 * - **Signed-in**: source of truth is the server (`src/features/wishlist/data.ts`
 *   Server Actions), mirrored into a **shared, module-level** zustand store
 *   (`server-wishlist-store.ts`) rather than per-instance React state —
 *   every `useWishlist()` instance (every product-card heart, the PDP, the
 *   header, the wishlist page, …) reads and mutates the *same* `ids`, so a
 *   toggle in one is immediately visible in every other. That store also
 *   owns the mount-load: `ensureLoaded()` dedupes concurrent instances
 *   mounting at once down to a single `getServerWishlistIds()` call, and
 *   `reset()` (called here when `signedIn` flips to `false`) clears it back
 *   to `idle` so a different user signing in on the same browser re-fetches
 *   instead of inheriting a stale wishlist. The store applies `toggle`'s
 *   optimistic add-or-remove immediately — using the same `ids.includes(id)`
 *   check the server performs, so the optimistic shape matches what the
 *   server will return — then runs `addWishlistItem`/`removeWishlistItem`
 *   and reconciles from its returned `ids`, or rolls back to the
 *   pre-mutation snapshot on `{error}`. This hook wraps that store mutation
 *   in its own `useTransition` so `isPending` still reflects on the acting
 *   instance only, exactly as before.
 */
export function useWishlist(): UseWishlistResult {
  const { signedIn } = useSession()

  // ---- guest backend: proxy the existing zustand store verbatim ----
  const guestIds = useWishlistStore((s) => s.ids)
  const guestToggle = useWishlistStore((s) => s.toggle)

  // ---- signed-in backend: shared server-wishlist store (see module doc) ----
  const serverIds = useServerWishlistStore((s) => s.ids)
  const serverStatus = useServerWishlistStore((s) => s.status)
  const ensureLoaded = useServerWishlistStore((s) => s.ensureLoaded)
  const resetServerWishlist = useServerWishlistStore((s) => s.reset)
  const serverToggle = useServerWishlistStore((s) => s.toggle)

  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    if (signedIn) {
      ensureLoaded()
    } else {
      resetServerWishlist()
    }
  }, [signedIn, ensureLoaded, resetServerWishlist])

  const ids = signedIn ? serverIds : guestIds

  const toggle = useCallback(
    (id: string) => {
      if (!signedIn) {
        guestToggle(id)
        return
      }
      startTransition(async () => {
        await serverToggle(id)
      })
    },
    [signedIn, guestToggle, serverToggle],
  )

  const has = useCallback((id: string) => ids.includes(id), [ids])

  // Guests read `ids` synchronously from localStorage; signed-in `ids` load
  // async from the server store. Mirrors `useCart`'s `itemsReady` half (no
  // product resolution here — a wishlist line is just an id).
  // `error` and `ready` both count as "settled": a failed initial load must not
  // pin `isLoading` true forever with no retry (that left the wishlist stuck on
  // a skeleton). Only the not-yet-settled states keep it loading. Failure logged
  // in the store.
  const isLoading = signedIn ? serverStatus === 'idle' || serverStatus === 'loading' : false

  return {
    ids,
    has,
    toggle,
    count: ids.length,
    isPending: signedIn ? isPending : false,
    isLoading,
  }
}
