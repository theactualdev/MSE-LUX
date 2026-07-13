import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const RECENTLY_VIEWED_MAX = 8

interface RecentlyViewedState {
  ids: string[]
  add: (id: string) => void
  clear: () => void
}

export const useRecentlyViewedStore = create<RecentlyViewedState>()(
  persist(
    (set) => ({
      ids: [],
      add: (id: string) =>
        set((state) => ({
          ids: [id, ...state.ids.filter((x) => x !== id)].slice(0, RECENTLY_VIEWED_MAX),
        })),
      clear: () => set({ ids: [] }),
    }),
    { name: 'mselux-recently-viewed' },
  ),
)

export const useRecentlyViewed = () => useRecentlyViewedStore((state) => state.ids)
