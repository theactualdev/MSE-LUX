import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface CartItem {
  productId: string
  variantId?: string
  quantity: number
}

interface CartState {
  items: CartItem[]
  addItem: (productId: string, variantId?: string, qty?: number) => void
  itemCount: () => number
  clear: () => void
}

const key = (i: { productId: string; variantId?: string }) => `${i.productId}::${i.variantId ?? ''}`

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      addItem: (productId, variantId, qty = 1) =>
        set((s) => {
          const k = key({ productId, variantId })
          const existing = s.items.find((i) => key(i) === k)
          if (existing) {
            return {
              items: s.items.map((i) => (key(i) === k ? { ...i, quantity: i.quantity + qty } : i)),
            }
          }
          return { items: [...s.items, { productId, variantId, quantity: qty }] }
        }),
      itemCount: () => get().items.reduce((n, i) => n + i.quantity, 0),
      clear: () => set({ items: [] }),
    }),
    { name: 'mselux-cart' },
  ),
)
