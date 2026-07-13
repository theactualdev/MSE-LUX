import { describe, it, expect } from 'vitest'
import * as sel from '@/features/catalog/lib/selectors'

describe('catalog selectors', () => {
  it('finds a product by slug', () => {
    const all = sel.getAllProducts()
    const first = all[0]
    expect(sel.getProductBySlug(first.slug)).toEqual(first)
    expect(sel.getProductBySlug('does-not-exist')).toBeUndefined()
  })
  it('returns only active products from getAllProducts', () => {
    expect(sel.getAllProducts().every((p) => p.status === 'active')).toBe(true)
  })
  it('filters products by category and subcategory', () => {
    const jewelry = sel.getProductsByCategory('jewelry')
    expect(jewelry.length).toBeGreaterThan(0)
    expect(jewelry.every((p) => p.categorySlug === 'jewelry')).toBe(true)
  })
  it('resolves a collection and its products', () => {
    const c = sel.getAllCollections()[0]
    expect(sel.getCollectionBySlug(c.slug)).toEqual(c)
    expect(sel.getProductsInCollection(c.slug).every((p) => p.collectionSlugs.includes(c.slug))).toBe(true)
  })
  it('best sellers and new arrivals are non-empty and badge-driven', () => {
    expect(sel.getBestSellers().every((p) => p.badges.includes('best-seller'))).toBe(true)
    expect(sel.getNewArrivals().every((p) => p.badges.includes('new'))).toBe(true)
  })
  it('related products exclude the source and share its category', () => {
    const p = sel.getAllProducts()[0]
    const related = sel.getRelatedProducts(p, 4)
    expect(related.find((r) => r.id === p.id)).toBeUndefined()
    expect(related.length).toBeLessThanOrEqual(4)
  })
})
