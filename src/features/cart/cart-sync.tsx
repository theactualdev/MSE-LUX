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

  useEffect(() => {
    if (!signedIn) {
      mergedRef.current = false
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

    // Guards each write against a sign-out that happens while its merge is
    // still in flight: the server-side merge already committed for the user
    // it ran under (correct for them), but the local store now belongs to a
    // different session (or none) and must not be overwritten by a result
    // that no longer applies to it.
    let active = true

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
          if (!active) return
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
          if (!active) return
          if ('ok' in result) {
            setServerIds(result.ids)
            useWishlistStore.getState().clear()
          }
        })
        .catch(() => {})
    }

    return () => {
      active = false
    }
  }, [signedIn, setServerItems, setServerIds])

  return null
}
