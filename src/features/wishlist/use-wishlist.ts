'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { useSession } from '@/features/auth/use-session'
import { useWishlistStore } from '@/features/wishlist/store'
import { addWishlistItem, getServerWishlistIds, removeWishlistItem } from '@/features/wishlist/data'

export interface UseWishlistResult {
  ids: string[]
  has: (id: string) => boolean
  toggle: (id: string) => void
  count: number
  isPending: boolean
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
 *   Server Actions), mirrored into local React state. `ids` is seeded from
 *   `getServerWishlistIds()` on mount/sign-in, guarded against unmount and
 *   against a stale response landing after a newer effect run has superseded
 *   it (the `active` flag pattern `useCart`/`useSession` use). `toggle`
 *   applies an optimistic add-or-remove to that state immediately — using
 *   the same `ids.includes(id)` check the server performs, so the optimistic
 *   shape matches what the server will return — then runs `addWishlistItem`
 *   or `removeWishlistItem` inside `startTransition` and reconciles from its
 *   returned `ids`, or rolls back to the pre-mutation snapshot on `{error}`.
 *   A ref tracks the latest snapshot alongside state so two toggles fired in
 *   quick succession (before a re-render lands) don't optimistically diverge
 *   from each other.
 */
export function useWishlist(): UseWishlistResult {
  const { signedIn } = useSession()

  // ---- guest backend: proxy the existing zustand store verbatim ----
  const guestIds = useWishlistStore((s) => s.ids)
  const guestToggle = useWishlistStore((s) => s.toggle)

  // ---- signed-in backend: server state mirrored into local React state ----
  const [serverIds, setServerIds] = useState<string[]>([])
  const serverIdsRef = useRef<string[]>([])
  useEffect(() => {
    serverIdsRef.current = serverIds
  }, [serverIds])
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    if (!signedIn) return
    let active = true
    getServerWishlistIds().then((loaded) => {
      if (active) setServerIds(loaded)
    })
    return () => {
      active = false
    }
  }, [signedIn])

  const ids = signedIn ? serverIds : guestIds

  const toggle = useCallback(
    (id: string) => {
      if (!signedIn) {
        guestToggle(id)
        return
      }
      const snapshot = serverIdsRef.current
      const isRemoving = snapshot.includes(id)
      const optimistic = isRemoving ? snapshot.filter((i) => i !== id) : [...snapshot, id]
      serverIdsRef.current = optimistic
      setServerIds(optimistic)
      startTransition(async () => {
        const result = isRemoving ? await removeWishlistItem(id) : await addWishlistItem(id)
        if ('ok' in result) {
          serverIdsRef.current = result.ids
          setServerIds(result.ids)
        } else {
          serverIdsRef.current = snapshot
          setServerIds(snapshot)
        }
      })
    },
    [signedIn, guestToggle],
  )

  const has = useCallback((id: string) => ids.includes(id), [ids])

  return {
    ids,
    has,
    toggle,
    count: ids.length,
    isPending: signedIn ? isPending : false,
  }
}
