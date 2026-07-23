import { create } from 'zustand'
import { addCartItem, clearServerCart, getServerCartItems, removeCartItem, setCartItemQty } from '@/features/cart/data'
import type { GuestCartItem } from '@/features/cart/types'

type CartStatus = 'idle' | 'loading' | 'ready'

interface ServerCartStore {
  items: GuestCartItem[]
  status: CartStatus
  ensureLoaded: () => void
  reset: () => void
  add: (productId: string, variantId: string | undefined, qty: number) => Promise<void>
  setQty: (productId: string, variantId: string | undefined, qty: number) => Promise<void>
  remove: (productId: string, variantId: string | undefined) => Promise<void>
  clear: () => Promise<void>
  setItems: (items: GuestCartItem[]) => void
}

/**
 * Matches `key()` in `store.ts` (the guest cart) — kept in sync there so an
 * optimistic write here lands on the same line the server upsert would.
 */
const lineKey = (i: { productId: string; variantId?: string }) => `${i.productId}::${i.variantId ?? ''}`

export function optimisticAdd(items: GuestCartItem[], productId: string, variantId: string | undefined, qty: number): GuestCartItem[] {
  const k = lineKey({ productId, variantId })
  const existing = items.find((i) => lineKey(i) === k)
  if (existing) {
    return items.map((i) => (lineKey(i) === k ? { ...i, quantity: i.quantity + qty } : i))
  }
  return [...items, { productId, variantId, quantity: qty }]
}

export function optimisticSetQty(items: GuestCartItem[], productId: string, variantId: string | undefined, qty: number): GuestCartItem[] {
  const k = lineKey({ productId, variantId })
  if (qty <= 0) return items.filter((i) => lineKey(i) !== k)
  const existing = items.find((i) => lineKey(i) === k)
  if (existing) return items.map((i) => (lineKey(i) === k ? { ...i, quantity: qty } : i))
  return [...items, { productId, variantId, quantity: qty }]
}

export function optimisticRemove(items: GuestCartItem[], productId: string, variantId: string | undefined): GuestCartItem[] {
  const k = lineKey({ productId, variantId })
  return items.filter((i) => lineKey(i) !== k)
}

/**
 * Module-scoped (not store state) so a re-entrant `ensureLoaded()` call from
 * a second-mounting instance — before the first fetch's `.then` has landed —
 * observes it and no-ops, rather than firing a second `getServerCartItems()`
 * request. Reset alongside `items`/`status` in `reset()` so a signed-out ->
 * signed-in-as-a-different-user transition on the same tab starts clean.
 */
let inflight: Promise<void> | null = null

/**
 * Bumped by every `reset()` (sign-out) and captured by every in-flight read
 * or mutation before its `await`. A `.then`/reconcile only applies its
 * result if the epoch it captured still matches the current one — otherwise
 * a stale response from a fetch or mutation that was still in flight when
 * `reset()` ran (sign-out) would land *after* the reset (or after a
 * different user's own fresh load) and clobber the store with the previous
 * user's cart. Without this, `inflight`/`status` alone aren't enough: they
 * guard against redundant *concurrent* fetches, not against a slow fetch
 * outliving the session it belongs to. The direct replacement for the old
 * per-instance hook's `active` flag, now needed at module scope because the
 * load itself moved out of the component.
 */
let epoch = 0

/**
 * Shared, module-level home for the signed-in user's server cart — the
 * `zustand` analog of `store.ts`'s guest cart, so every `useCart()` instance
 * (header badge, mini-cart drawer, cart page, add-to-cart button, …) reads
 * and mutates the *same* state instead of each holding its own isolated
 * copy. See `use-cart.ts` for how the hook wires this in behind its
 * unchanged public API.
 */
export const useServerCartStore = create<ServerCartStore>()((set, get) => ({
  items: [],
  status: 'idle',

  ensureLoaded: () => {
    if (get().status !== 'idle' || inflight) return
    const myEpoch = ++epoch
    set({ status: 'loading' })
    inflight = getServerCartItems()
      .then((items) => {
        if (myEpoch === epoch) set({ items, status: 'ready' })
      })
      .finally(() => {
        inflight = null
      })
  },

  reset: () => {
    epoch++
    inflight = null
    set({ items: [], status: 'idle' })
  },

  add: async (productId, variantId, qty) => {
    const myEpoch = epoch
    const snapshot = get().items
    set({ items: optimisticAdd(snapshot, productId, variantId, qty) })
    const result = await addCartItem(productId, variantId, qty)
    if (myEpoch !== epoch) return
    if ('ok' in result) {
      set({ items: result.items })
    } else {
      set({ items: snapshot })
    }
  },

  setQty: async (productId, variantId, qty) => {
    const myEpoch = epoch
    const snapshot = get().items
    set({ items: optimisticSetQty(snapshot, productId, variantId, qty) })
    const result = await setCartItemQty(productId, variantId, qty)
    if (myEpoch !== epoch) return
    if ('ok' in result) {
      set({ items: result.items })
    } else {
      set({ items: snapshot })
    }
  },

  remove: async (productId, variantId) => {
    const myEpoch = epoch
    const snapshot = get().items
    set({ items: optimisticRemove(snapshot, productId, variantId) })
    const result = await removeCartItem(productId, variantId)
    if (myEpoch !== epoch) return
    if ('ok' in result) {
      set({ items: result.items })
    } else {
      set({ items: snapshot })
    }
  },

  clear: async () => {
    const myEpoch = epoch
    const snapshot = get().items
    set({ items: [] })
    const result = await clearServerCart()
    if (myEpoch !== epoch) return
    if ('ok' in result) {
      set({ items: result.items })
    } else {
      set({ items: snapshot })
    }
  },

  /**
   * Pushes a result computed outside the normal mutation flow (currently:
   * `cart-sync.tsx`'s guest->account merge) straight into the store. Bumps
   * `epoch` and clears `inflight` exactly like `reset()` does, so a
   * concurrent `ensureLoaded()` fetch that was already in flight (kicked off
   * by the same sign-in that triggered the merge) is discarded instead of
   * landing afterward and clobbering the merged result with stale
   * pre-merge server items.
   */
  setItems: (items) => {
    epoch++
    inflight = null
    set({ items, status: 'ready' })
  },
}))
