import { describe, it, expect, beforeEach } from 'vitest'
import { useCartStore } from '@/features/cart/store'

describe('cart store', () => {
  beforeEach(() => useCartStore.getState().clear())
  it('adds an item and counts quantity', () => {
    useCartStore.getState().addItem('p1', undefined, 2)
    expect(useCartStore.getState().itemCount()).toBe(2)
  })
  it('dedupes by product+variant, summing quantity', () => {
    useCartStore.getState().addItem('p1', 'v1', 1)
    useCartStore.getState().addItem('p1', 'v1', 2)
    expect(useCartStore.getState().items.length).toBe(1)
    expect(useCartStore.getState().itemCount()).toBe(3)
  })
  it('treats different variants of the same product as separate lines', () => {
    useCartStore.getState().addItem('p1', 'v1', 1)
    useCartStore.getState().addItem('p1', 'v2', 1)
    expect(useCartStore.getState().items.length).toBe(2)
    expect(useCartStore.getState().itemCount()).toBe(2)
  })
  it('removes a line by product+variant', () => {
    useCartStore.getState().addItem('p1', 'v1', 2)
    useCartStore.getState().addItem('p2', undefined, 1)
    useCartStore.getState().removeItem('p1', 'v1')
    expect(useCartStore.getState().items.find((i) => i.productId === 'p1')).toBeUndefined()
    expect(useCartStore.getState().itemCount()).toBe(1)
  })
  it('updates a line quantity and clamps to at least 1', () => {
    useCartStore.getState().addItem('p1', 'v1', 1)
    useCartStore.getState().updateQuantity('p1', 'v1', 5)
    expect(useCartStore.getState().items[0].quantity).toBe(5)
    useCartStore.getState().updateQuantity('p1', 'v1', 0)
    expect(useCartStore.getState().items[0].quantity).toBe(1)
  })
})
