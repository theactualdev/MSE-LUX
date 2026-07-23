import { create } from 'zustand'
import { addWishlistItem, getServerWishlistIds, removeWishlistItem } from '@/features/wishlist/data'

type WishlistStatus = 'idle' | 'loading' | 'ready'

interface ServerWishlistStore {
  ids: string[]
  status: WishlistStatus
  ensureLoaded: () => void
  reset: () => void
  toggle: (id: string) => Promise<void>
  setIds: (ids: string[]) => void
}

/**
 * Module-scoped (not store state) so a re-entrant `ensureLoaded()` call from
 * a second-mounting instance — before the first fetch's `.then` has landed —
 * observes it and no-ops, rather than firing a second `getServerWishlistIds()`
 * request. Reset alongside `ids`/`status` in `reset()` so a signed-out ->
 * signed-in-as-a-different-user transition on the same tab starts clean.
 */
let inflight: Promise<void> | null = null

/**
 * Shared, module-level home for the signed-in user's server wishlist — the
 * `zustand` analog of `store.ts`'s guest wishlist, so every `useWishlist()`
 * instance (every product-card heart, the PDP, the header, the wishlist
 * page, …) reads and mutates the *same* state instead of each holding its
 * own isolated copy. The exact analog of `server-cart-store.ts` with
 * quantity/inventory removed. See `use-wishlist.ts` for how the hook wires
 * this in behind its unchanged public API.
 */
export const useServerWishlistStore = create<ServerWishlistStore>()((set, get) => ({
  ids: [],
  status: 'idle',

  ensureLoaded: () => {
    if (get().status !== 'idle' || inflight) return
    set({ status: 'loading' })
    inflight = getServerWishlistIds()
      .then((ids) => {
        set({ ids, status: 'ready' })
      })
      .finally(() => {
        inflight = null
      })
  },

  reset: () => {
    inflight = null
    set({ ids: [], status: 'idle' })
  },

  toggle: async (id) => {
    const snapshot = get().ids
    const isRemoving = snapshot.includes(id)
    set({ ids: isRemoving ? snapshot.filter((i) => i !== id) : [...snapshot, id] })
    const result = isRemoving ? await removeWishlistItem(id) : await addWishlistItem(id)
    if ('ok' in result) {
      set({ ids: result.ids })
    } else {
      set({ ids: snapshot })
    }
  },

  setIds: (ids) => set({ ids, status: 'ready' }),
}))
