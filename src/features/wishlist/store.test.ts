import { describe, it, expect, beforeEach } from 'vitest'
import { useWishlistStore } from '@/features/wishlist/store'

describe('wishlist store', () => {
  beforeEach(() => useWishlistStore.getState().clear())
  it('toggle adds an id then removes it', () => {
    useWishlistStore.getState().toggle('p1')
    expect(useWishlistStore.getState().ids).toEqual(['p1'])
    useWishlistStore.getState().toggle('p1')
    expect(useWishlistStore.getState().ids).toEqual([])
  })
  it('has reflects current state', () => {
    expect(useWishlistStore.getState().has('p1')).toBe(false)
    useWishlistStore.getState().toggle('p1')
    expect(useWishlistStore.getState().has('p1')).toBe(true)
  })
  it('count reflects the number of ids', () => {
    useWishlistStore.getState().toggle('p1')
    useWishlistStore.getState().toggle('p2')
    expect(useWishlistStore.getState().count()).toBe(2)
  })
  it('treats different ids independently', () => {
    useWishlistStore.getState().toggle('p1')
    useWishlistStore.getState().toggle('p2')
    useWishlistStore.getState().toggle('p1')
    expect(useWishlistStore.getState().has('p1')).toBe(false)
    expect(useWishlistStore.getState().has('p2')).toBe(true)
    expect(useWishlistStore.getState().count()).toBe(1)
  })
})
