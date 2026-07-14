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
  it('removes only the matching product+variant line, leaving other variants of the same product', () => {
    useCartStore.getState().addItem('p1', 'v1', 2)
    useCartStore.getState().addItem('p1', 'v2', 3) // same product, different variant
    useCartStore.getState().addItem('p2', undefined, 1)
    useCartStore.getState().removeItem('p1', 'v1')
    const items = useCartStore.getState().items
    expect(items.find((i) => i.productId === 'p1' && i.variantId === 'v1')).toBeUndefined()
    // the other variant of p1 must survive — proves the key is product+variant, not productId alone
    expect(items.find((i) => i.productId === 'p1' && i.variantId === 'v2')?.quantity).toBe(3)
    expect(items.find((i) => i.productId === 'p2')).toBeDefined()
    expect(useCartStore.getState().itemCount()).toBe(4)
  })
  it('updates only the matching line quantity and clamps to at least 1', () => {
    useCartStore.getState().addItem('p1', 'v1', 1)
    useCartStore.getState().addItem('p1', 'v2', 4) // a second line that must stay untouched
    useCartStore.getState().updateQuantity('p1', 'v1', 5)
    const get = (v: string) => useCartStore.getState().items.find((i) => i.variantId === v)?.quantity
    expect(get('v1')).toBe(5)
    expect(get('v2')).toBe(4) // untouched
    useCartStore.getState().updateQuantity('p1', 'v1', 0)
    expect(get('v1')).toBe(1) // clamped
    expect(get('v2')).toBe(4) // still untouched
  })
})
