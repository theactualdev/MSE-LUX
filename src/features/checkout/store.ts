import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { Order } from '@/features/checkout/lib/place-order'

interface LastOrderState {
  order: Order | null
  setOrder: (order: Order) => void
  clear: () => void
}

export const useLastOrderStore = create<LastOrderState>()(
  persist(
    (set) => ({
      order: null,
      setOrder: (order) => set({ order }),
      clear: () => set({ order: null }),
    }),
    {
      name: 'mselux-last-order',
      storage: createJSONStorage(() => sessionStorage),
    },
  ),
)
