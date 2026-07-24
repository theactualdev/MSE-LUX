'use client'

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react'
import type { Product } from '@/types/catalog'
import { useSession } from '@/features/auth/use-session'
import { useCartStore } from '@/features/cart/store'
import { useServerCartStore } from '@/features/cart/server-cart-store'
import { buildCartLines, type CartLine } from '@/features/cart/lib/lines'
import { resolveProductsByIds } from '@/features/catalog/server/resolve-products'
import type { GuestCartItem } from '@/features/cart/types'

export interface UseCartResult {
  items: GuestCartItem[]
  lines: CartLine[]
  itemCount: number
  add: (productId: string, variantId?: string, qty?: number) => void
  setQty: (productId: string, variantId: string | undefined, qty: number) => void
  remove: (productId: string, variantId?: string) => void
  clear: () => void
  isPending: boolean
  isLoading: boolean
}

/**
 * Unified cart hook that hides the guest-vs-signed-in storage split from
 * every consumer (mini-cart drawer, full cart page, add-to-cart button, …).
 *
 * - **Guest** (`useSession().signedIn === false`): a thin proxy over
 *   `useCartStore` (localStorage). Behaves exactly like the store did before
 *   this hook existed — `isPending` is always `false`, nothing async happens.
 * - **Signed-in**: source of truth is the server (`src/features/cart/data.ts`
 *   Server Actions), mirrored into a **shared, module-level** zustand store
 *   (`server-cart-store.ts`) rather than per-instance React state — every
 *   `useCart()` instance reads and mutates the *same* `items`, so a mutation
 *   in one (e.g. the add-to-cart button) is immediately visible in every
 *   other (the header badge, the always-mounted mini-cart drawer). That
 *   store also owns the mount-load: `ensureLoaded()` dedupes concurrent
 *   instances mounting at once down to a single `getServerCartItems()` call,
 *   and `reset()` (called here when `signedIn` flips to `false`) clears it
 *   back to `idle` so a different user signing in on the same browser
 *   re-fetches instead of inheriting a stale cart. The store applies each
 *   mutation's optimistic update immediately (mirroring the guest store's
 *   own merge-by-key logic so the optimistic shape matches what the server
 *   will return), then runs the server action and reconciles from its
 *   returned `items` — or rolls back to the pre-mutation snapshot on
 *   `{error}`. This hook wraps those store mutations in its own
 *   `useTransition` so `isPending` still reflects on the acting instance
 *   only, exactly as before.
 *
 * Both modes only ever store `{productId,variantId,quantity}` lines, never
 * full products (see `types.ts` / `store.ts`), so `lines` is derived by
 * resolving `items` through the `resolveProductsByIds` server action and
 * building `CartLine[]` via `buildCartLines`. That resolution is async, so
 * `lines` lives in its own state, populated by an effect keyed on the
 * (deduped, order-independent) set of product ids currently in the cart —
 * not on `items` itself, so a quantity-only change doesn't re-fetch
 * products, only re-derives lines from the already-resolved set. The effect
 * guards against unmount and against a stale resolution landing after a
 * newer id-set has superseded it, the same `active` flag pattern
 * `useSession` uses. This resolution stays per-hook-instance (unlike
 * `items`): only 1–2 line-rendering consumers are ever mounted at once, so
 * there's no redundant-fetch problem worth sharing it for.
 *
 * Cart currency is hardcoded to `'NGN'` (Phase 5b decision A: cart stays
 * NGN-only until 5d threads viewer currency through checkout).
 */
export function useCart(): UseCartResult {
  const { signedIn } = useSession()

  // ---- guest backend: proxy the existing zustand store verbatim ----
  const guestItems = useCartStore((s) => s.items)
  const guestAddItem = useCartStore((s) => s.addItem)
  const guestRemoveItem = useCartStore((s) => s.removeItem)
  const guestUpdateQuantity = useCartStore((s) => s.updateQuantity)
  const guestClear = useCartStore((s) => s.clear)

  // ---- signed-in backend: shared server-cart store (see module doc) ----
  const serverItems = useServerCartStore((s) => s.items)
  const serverStatus = useServerCartStore((s) => s.status)
  const ensureLoaded = useServerCartStore((s) => s.ensureLoaded)
  const resetServerCart = useServerCartStore((s) => s.reset)
  const serverAdd = useServerCartStore((s) => s.add)
  const serverSetQty = useServerCartStore((s) => s.setQty)
  const serverRemove = useServerCartStore((s) => s.remove)
  const serverClear = useServerCartStore((s) => s.clear)

  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    if (signedIn) {
      ensureLoaded()
    } else {
      resetServerCart()
    }
  }, [signedIn, ensureLoaded, resetServerCart])

  const items = signedIn ? serverItems : guestItems

  // ---- lines: resolve products for the current id set, race/unmount-guarded ----
  const idsKey = useMemo(() => {
    const ids = new Set(items.map((i) => i.productId))
    return Array.from(ids).sort().join(',')
  }, [items])

  const [products, setProducts] = useState<Product[]>([])
  const [resolvedKey, setResolvedKey] = useState('')

  useEffect(() => {
    // No ids to resolve: nothing to fetch. `products` is left as-is rather
    // than reset to `[]` here — `buildCartLines` iterates `items`, so an
    // empty `items` array already yields `[]` lines regardless of what
    // `products` holds, and resetting would be a synchronous setState in an
    // effect body for no behavioral gain.
    if (idsKey === '') return
    const ids = idsKey.split(',')
    let active = true
    resolveProductsByIds(ids)
      .then((resolved) => {
        if (active) {
          setProducts(resolved)
          setResolvedKey(idsKey)
        }
      })
      .catch((error) => {
        // Don't leave `linesResolved` false forever (which pins `isLoading`
        // true and shows a perpetual loading state). Mark this id set resolved
        // — `products` stays as-is, so `buildCartLines` yields whatever it can
        // — and surface the cause instead of swallowing it.
        console.error('[useCart] resolveProductsByIds failed', error)
        if (active) setResolvedKey(idsKey)
      })
    return () => {
      active = false
    }
  }, [idsKey])

  const lines = useMemo(() => buildCartLines(items, products, 'NGN'), [items, products])
  const itemCount = items.reduce((n, i) => n + i.quantity, 0)

  // Cart contents are "definitively known" once (a) signed-in items have
  // loaded from the server (guests are synchronous) and (b) the resolved
  // product set matches the current id set (or there was nothing to
  // resolve). See module doc for the flash/stuck-skeleton failure modes
  // this guards against.
  // `error` counts as settled (not loading): a failed initial load must not
  // pin `isLoading` true forever with no retry — better to show the empty/
  // current state than a perpetual skeleton. The failure is logged in the store.
  const itemsReady = signedIn ? serverStatus === 'ready' || serverStatus === 'error' : true
  const linesResolved = idsKey === '' || resolvedKey === idsKey
  const isLoading = !itemsReady || !linesResolved

  const add = useCallback(
    (productId: string, variantId?: string, qty = 1) => {
      if (!signedIn) {
        guestAddItem(productId, variantId, qty)
        return
      }
      startTransition(async () => {
        await serverAdd(productId, variantId, qty)
      })
    },
    [signedIn, guestAddItem, serverAdd, startTransition],
  )

  const setQty = useCallback(
    (productId: string, variantId: string | undefined, qty: number) => {
      if (!signedIn) {
        guestUpdateQuantity(productId, variantId, qty)
        return
      }
      startTransition(async () => {
        await serverSetQty(productId, variantId, qty)
      })
    },
    [signedIn, guestUpdateQuantity, serverSetQty, startTransition],
  )

  const remove = useCallback(
    (productId: string, variantId?: string) => {
      if (!signedIn) {
        guestRemoveItem(productId, variantId)
        return
      }
      startTransition(async () => {
        await serverRemove(productId, variantId)
      })
    },
    [signedIn, guestRemoveItem, serverRemove, startTransition],
  )

  const clear = useCallback(() => {
    if (!signedIn) {
      guestClear()
      return
    }
    startTransition(async () => {
      await serverClear()
    })
  }, [signedIn, guestClear, serverClear, startTransition])

  return {
    items,
    lines,
    itemCount,
    add,
    setQty,
    remove,
    clear,
    isPending: signedIn ? isPending : false,
    isLoading,
  }
}
