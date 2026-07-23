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
    set({ status: 'loading' })
    inflight = getServerCartItems()
      .then((items) => {
        set({ items, status: 'ready' })
      })
      .finally(() => {
        inflight = null
      })
  },

  reset: () => {
    inflight = null
    set({ items: [], status: 'idle' })
  },

  add: async (productId, variantId, qty) => {
    const snapshot = get().items
    set({ items: optimisticAdd(snapshot, productId, variantId, qty) })
    const result = await addCartItem(productId, variantId, qty)
    if ('ok' in result) {
      set({ items: result.items })
    } else {
      set({ items: snapshot })
    }
  },

  setQty: async (productId, variantId, qty) => {
    const snapshot = get().items
    set({ items: optimisticSetQty(snapshot, productId, variantId, qty) })
    const result = await setCartItemQty(productId, variantId, qty)
    if ('ok' in result) {
      set({ items: result.items })
    } else {
      set({ items: snapshot })
    }
  },

  remove: async (productId, variantId) => {
    const snapshot = get().items
    set({ items: optimisticRemove(snapshot, productId, variantId) })
    const result = await removeCartItem(productId, variantId)
    if ('ok' in result) {
      set({ items: result.items })
    } else {
      set({ items: snapshot })
    }
  },

  clear: async () => {
    const snapshot = get().items
    set({ items: [] })
    const result = await clearServerCart()
    if ('ok' in result) {
      set({ items: result.items })
    } else {
      set({ items: snapshot })
    }
  },

  setItems: (items) => set({ items, status: 'ready' }),
}))
