import { describe, it, expect, beforeEach } from 'vitest'
import { useRecentlyViewedStore } from './use-recently-viewed'

describe('recently-viewed store', () => {
  beforeEach(() => useRecentlyViewedStore.getState().clear())

  it('should add an id to the list', () => {
    useRecentlyViewedStore.getState().add('product-1')
    expect(useRecentlyViewedStore.getState().ids).toEqual(['product-1'])
  })

  it('should put new id first when adding', () => {
    useRecentlyViewedStore.getState().add('product-1')
    useRecentlyViewedStore.getState().add('product-2')
    useRecentlyViewedStore.getState().add('product-3')
    expect(useRecentlyViewedStore.getState().ids).toEqual(['product-3', 'product-2', 'product-1'])
  })

  it('should move existing id to front when re-added (dedupe)', () => {
    useRecentlyViewedStore.getState().add('product-1')
    useRecentlyViewedStore.getState().add('product-2')
    useRecentlyViewedStore.getState().add('product-3')
    expect(useRecentlyViewedStore.getState().ids).toEqual(['product-3', 'product-2', 'product-1'])

    useRecentlyViewedStore.getState().add('product-1')
    expect(useRecentlyViewedStore.getState().ids).toEqual(['product-1', 'product-3', 'product-2'])
  })

  it('should cap list at 8 items', () => {
    // Add 9 items
    for (let i = 1; i <= 9; i++) {
      useRecentlyViewedStore.getState().add(`product-${i}`)
    }
    expect(useRecentlyViewedStore.getState().ids).toHaveLength(8)
    // Most recent first, oldest (product-1) should be dropped
    expect(useRecentlyViewedStore.getState().ids).toEqual([
      'product-9',
      'product-8',
      'product-7',
      'product-6',
      'product-5',
      'product-4',
      'product-3',
      'product-2',
    ])
  })

  it('should clear the list', () => {
    useRecentlyViewedStore.getState().add('product-1')
    useRecentlyViewedStore.getState().add('product-2')
    expect(useRecentlyViewedStore.getState().ids).toHaveLength(2)

    useRecentlyViewedStore.getState().clear()
    expect(useRecentlyViewedStore.getState().ids).toEqual([])
  })
})
