import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface WishlistState {
  ids: string[]
  toggle: (id: string) => void
  has: (id: string) => boolean
  count: () => number
  clear: () => void
}

export const useWishlistStore = create<WishlistState>()(
  persist(
    (set, get) => ({
      ids: [],
      toggle: (id) =>
        set((s) => ({
          ids: s.ids.includes(id) ? s.ids.filter((i) => i !== id) : [...s.ids, id],
        })),
      has: (id) => get().ids.includes(id),
      count: () => get().ids.length,
      clear: () => set({ ids: [] }),
    }),
    { name: 'mselux-wishlist' },
  ),
)
