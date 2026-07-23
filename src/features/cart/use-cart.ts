'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import type { Product } from '@/types/catalog'
import { useSession } from '@/features/auth/use-session'
import { useCartStore } from '@/features/cart/store'
import { buildCartLines, type CartLine } from '@/features/cart/lib/lines'
import { resolveProductsByIds } from '@/features/catalog/server/resolve-products'
import { addCartItem, clearServerCart, getServerCartItems, removeCartItem, setCartItemQty } from '@/features/cart/data'
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

/** Matches `key()` in `store.ts` — kept in sync there so an optimistic write here lands on the same line the server upsert would. */
const lineKey = (i: { productId: string; variantId?: string }) => `${i.productId}::${i.variantId ?? ''}`

function optimisticAdd(items: GuestCartItem[], productId: string, variantId: string | undefined, qty: number): GuestCartItem[] {
  const k = lineKey({ productId, variantId })
  const existing = items.find((i) => lineKey(i) === k)
  if (existing) {
    return items.map((i) => (lineKey(i) === k ? { ...i, quantity: i.quantity + qty } : i))
  }
  return [...items, { productId, variantId, quantity: qty }]
}

function optimisticSetQty(items: GuestCartItem[], productId: string, variantId: string | undefined, qty: number): GuestCartItem[] {
  const k = lineKey({ productId, variantId })
  if (qty <= 0) return items.filter((i) => lineKey(i) !== k)
  const existing = items.find((i) => lineKey(i) === k)
  if (existing) return items.map((i) => (lineKey(i) === k ? { ...i, quantity: qty } : i))
  return [...items, { productId, variantId, quantity: qty }]
}

function optimisticRemove(items: GuestCartItem[], productId: string, variantId: string | undefined): GuestCartItem[] {
  const k = lineKey({ productId, variantId })
  return items.filter((i) => lineKey(i) !== k)
}

/**
 * Unified cart hook that hides the guest-vs-signed-in storage split from
 * every consumer (mini-cart drawer, full cart page, add-to-cart button, …).
 *
 * - **Guest** (`useSession().signedIn === false`): a thin proxy over
 *   `useCartStore` (localStorage). Behaves exactly like the store did before
 *   this hook existed — `isPending` is always `false`, nothing async happens.
 * - **Signed-in**: source of truth is the server (`src/features/cart/data.ts`
 *   Server Actions), mirrored into local React state. `items` is seeded from
 *   `getServerCartItems()` on mount/sign-in. Every mutation applies an
 *   optimistic update to that state immediately (mirroring the store's own
 *   merge-by-key logic so the optimistic shape matches what the server will
 *   return), then runs the server action inside `startTransition` and
 *   reconciles from its returned `items` — or rolls back to the pre-mutation
 *   snapshot on `{error}`. A ref tracks the latest snapshot alongside state
 *   so two mutations fired in quick succession (before a re-render lands)
 *   don't optimistically diverge from each other.
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
 * `useSession` uses.
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

  // ---- signed-in backend: server state mirrored into local React state ----
  const [serverItems, setServerItems] = useState<GuestCartItem[]>([])
  const serverItemsRef = useRef<GuestCartItem[]>([])
  useEffect(() => {
    serverItemsRef.current = serverItems
  }, [serverItems])
  const [isPending, startTransition] = useTransition()
  const [serverLoaded, setServerLoaded] = useState(false)

  useEffect(() => {
    if (!signedIn) return
    let active = true
    getServerCartItems().then((loaded) => {
      if (active) {
        setServerItems(loaded)
        setServerLoaded(true)
      }
    })
    return () => {
      active = false
    }
  }, [signedIn])

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
    resolveProductsByIds(ids).then((resolved) => {
      if (active) {
        setProducts(resolved)
        setResolvedKey(idsKey)
      }
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
  const itemsReady = signedIn ? serverLoaded : true
  const linesResolved = idsKey === '' || resolvedKey === idsKey
  const isLoading = !itemsReady || !linesResolved

  const add = useCallback(
    (productId: string, variantId?: string, qty = 1) => {
      if (!signedIn) {
        guestAddItem(productId, variantId, qty)
        return
      }
      const snapshot = serverItemsRef.current
      const optimistic = optimisticAdd(snapshot, productId, variantId, qty)
      serverItemsRef.current = optimistic
      setServerItems(optimistic)
      startTransition(async () => {
        const result = await addCartItem(productId, variantId, qty)
        if ('ok' in result) {
          serverItemsRef.current = result.items
          setServerItems(result.items)
        } else {
          serverItemsRef.current = snapshot
          setServerItems(snapshot)
        }
      })
    },
    [signedIn, guestAddItem],
  )

  const setQty = useCallback(
    (productId: string, variantId: string | undefined, qty: number) => {
      if (!signedIn) {
        guestUpdateQuantity(productId, variantId, qty)
        return
      }
      const snapshot = serverItemsRef.current
      const optimistic = optimisticSetQty(snapshot, productId, variantId, qty)
      serverItemsRef.current = optimistic
      setServerItems(optimistic)
      startTransition(async () => {
        const result = await setCartItemQty(productId, variantId, qty)
        if ('ok' in result) {
          serverItemsRef.current = result.items
          setServerItems(result.items)
        } else {
          serverItemsRef.current = snapshot
          setServerItems(snapshot)
        }
      })
    },
    [signedIn, guestUpdateQuantity],
  )

  const remove = useCallback(
    (productId: string, variantId?: string) => {
      if (!signedIn) {
        guestRemoveItem(productId, variantId)
        return
      }
      const snapshot = serverItemsRef.current
      const optimistic = optimisticRemove(snapshot, productId, variantId)
      serverItemsRef.current = optimistic
      setServerItems(optimistic)
      startTransition(async () => {
        const result = await removeCartItem(productId, variantId)
        if ('ok' in result) {
          serverItemsRef.current = result.items
          setServerItems(result.items)
        } else {
          serverItemsRef.current = snapshot
          setServerItems(snapshot)
        }
      })
    },
    [signedIn, guestRemoveItem],
  )

  const clear = useCallback(() => {
    if (!signedIn) {
      guestClear()
      return
    }
    const snapshot = serverItemsRef.current
    serverItemsRef.current = []
    setServerItems([])
    startTransition(async () => {
      const result = await clearServerCart()
      if ('ok' in result) {
        serverItemsRef.current = result.items
        setServerItems(result.items)
      } else {
        serverItemsRef.current = snapshot
        setServerItems(snapshot)
      }
    })
  }, [signedIn, guestClear])

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
