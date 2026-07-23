'use client'

import { useEffect, useRef } from 'react'
import { useSession } from '@/features/auth/use-session'
import { useCartStore } from '@/features/cart/store'
import { useWishlistStore } from '@/features/wishlist/store'
import { useServerCartStore } from '@/features/cart/server-cart-store'
import { useServerWishlistStore } from '@/features/wishlist/server-wishlist-store'
import { mergeGuestCart } from '@/features/cart/data'
import { mergeGuestWishlist } from '@/features/wishlist/data'

/**
 * Renders nothing. Watches `useSession().signedIn` and, the moment a guest
 * with pending local cart/wishlist items signs in, merges those local lists
 * into their account and clears the local copies — the single mechanic that
 * covers email/password sign-in, sign-up, and OAuth uniformly, since all
 * three ultimately just flip `signedIn` from false to true on this hook.
 *
 * Mount once, globally (`app-shell.tsx`), alongside the other client-only
 * providers — it has no UI and no props.
 */
export function CartSync() {
  const { signedIn } = useSession()
  const setServerItems = useServerCartStore((s) => s.setItems)
  const setServerIds = useServerWishlistStore((s) => s.setIds)
  // Once-per-authed-session guard: without it, a merge would refire on every
  // re-render while signedIn stays true (e.g. a route change), and
  // `mergeGuestCart` sums guest quantities onto whatever the server cart
  // already holds — a second run would double-count. Reset back to false the
  // moment `signedIn` goes false, so a different user signing in later (or
  // the same user again) is a fresh trigger.
  const mergedRef = useRef(false)
  // Bumped ONLY on a real sign-out (the `!signedIn` branch below) — never by
  // effect cleanup. React Strict Mode (dev only) double-invokes this effect
  // (setup -> cleanup -> setup) on every mount, including a fresh OAuth
  // login that mounts straight into `signedIn:true`. A cleanup-driven
  // "abandon this merge" flag would be tripped by that *synthetic* cleanup
  // even though the session never actually changed, causing the in-flight
  // merge's `.then` to skip clearing the guest store — which leaves
  // `mergedRef` stuck `true` over an uncleared cart, so every later reload
  // re-runs `mergeGuestCart` on the same guest items and double-counts.
  // Tying invalidation to a session counter instead of to cleanup means
  // Strict Mode's extra setup/cleanup pair (same session, epoch unchanged)
  // never invalidates the dispatched merge, while an actual sign-out (which
  // bumps the epoch here) still correctly abandons it.
  const sessionEpochRef = useRef(0)

  useEffect(() => {
    if (!signedIn) {
      mergedRef.current = false
      sessionEpochRef.current++
      return
    }
    if (mergedRef.current) return
    const guestCart = useCartStore.getState().items
    const guestWishlist = useWishlistStore.getState().ids
    // Nothing local to merge — either a genuinely empty guest, or an
    // already-signed-in user whose items live server-side and whose local
    // stores are (correctly) empty. Either way there's nothing to do, and no
    // merge means the once-guard doesn't need to flip either.
    if (guestCart.length === 0 && guestWishlist.length === 0) return
    mergedRef.current = true
    const mySession = sessionEpochRef.current

    // Cleared independently per store, only on that store's own success —
    // NOT "clear both iff both succeed". If the cart merge succeeds but is
    // left uncleared because the wishlist merge failed, the next login would
    // run `mergeGuestCart` again on the same guest items and double-count
    // their quantities against the server cart a second time. Clearing each
    // store the moment its own merge lands is what keeps a retry loss-free
    // AND double-count-free.
    if (guestCart.length > 0) {
      mergeGuestCart(guestCart)
        .then((result) => {
          // A real sign-out raced in and bumped the epoch — the server-side
          // merge already committed for the session it ran under (correct
          // for that user), but this client store no longer belongs to
          // them, so abandon the write.
          if (mySession !== sessionEpochRef.current) return
          if ('ok' in result) {
            setServerItems(result.items)
            useCartStore.getState().clear()
          }
        })
        .catch(() => {})
    }

    if (guestWishlist.length > 0) {
      mergeGuestWishlist(guestWishlist)
        .then((result) => {
          if (mySession !== sessionEpochRef.current) return
          if ('ok' in result) {
            setServerIds(result.ids)
            useWishlistStore.getState().clear()
          }
        })
        .catch(() => {})
    }

    // Deliberately no cleanup here that invalidates the dispatched merge —
    // see the `sessionEpochRef` comment above for why.
  }, [signedIn, setServerItems, setServerIds])

  return null
}
