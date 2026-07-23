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
 * Bumped by every `reset()` (sign-out) and captured by every in-flight read
 * or mutation before its `await`. A `.then`/reconcile only applies its
 * result if the epoch it captured still matches the current one — otherwise
 * a stale response from a fetch or mutation that was still in flight when
 * `reset()` ran (sign-out) would land *after* the reset (or after a
 * different user's own fresh load) and clobber the store with the previous
 * user's wishlist. Without this, `inflight`/`status` alone aren't enough:
 * they guard against redundant *concurrent* fetches, not against a slow
 * fetch outliving the session it belongs to. The direct replacement for the
 * old per-instance hook's `active` flag, now needed at module scope because
 * the load itself moved out of the component. Exact analog of
 * `server-cart-store.ts`'s `epoch`.
 */
let epoch = 0

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
    const myEpoch = ++epoch
    set({ status: 'loading' })
    inflight = getServerWishlistIds()
      .then((ids) => {
        if (myEpoch === epoch) set({ ids, status: 'ready' })
      })
      .finally(() => {
        inflight = null
      })
  },

  reset: () => {
    epoch++
    inflight = null
    set({ ids: [], status: 'idle' })
  },

  toggle: async (id) => {
    const myEpoch = epoch
    const snapshot = get().ids
    const isRemoving = snapshot.includes(id)
    set({ ids: isRemoving ? snapshot.filter((i) => i !== id) : [...snapshot, id] })
    const result = isRemoving ? await removeWishlistItem(id) : await addWishlistItem(id)
    if (myEpoch !== epoch) return
    if ('ok' in result) {
      set({ ids: result.ids })
    } else {
      set({ ids: snapshot })
    }
  },

  /**
   * Pushes a result computed outside the normal mutation flow (currently:
   * `cart-sync.tsx`'s guest->account merge) straight into the store. Bumps
   * `epoch` and clears `inflight` exactly like `reset()` does, so a
   * concurrent `ensureLoaded()` fetch that was already in flight (kicked off
   * by the same sign-in that triggered the merge) is discarded instead of
   * landing afterward and clobbering the merged result with stale
   * pre-merge server ids.
   */
  setIds: (ids) => {
    epoch++
    inflight = null
    set({ ids, status: 'ready' })
  },
}))
