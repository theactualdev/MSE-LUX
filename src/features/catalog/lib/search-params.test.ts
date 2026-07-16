import { describe, expect, it } from 'vitest'
import { parseSearchCriteria, toggleParamValue } from '@/features/catalog/lib/search-params'

describe('parseSearchCriteria', () => {
  it('defaults are empty/sensible', () => {
    expect(parseSearchCriteria({})).toEqual({
      query: undefined, categories: [], subcategory: undefined, materials: [], colors: [],
      badges: [], priceMin: undefined, priceMax: undefined, inStock: false, sort: 'newest',
    })
  })

  it('parses a full query string', () => {
    const c = parseSearchCriteria({
      q: 'cowrie', material: ['Brass', 'Cowrie shell'], color: 'Gold',
      badge: ['new'], category: 'jewelry', subcategory: 'necklaces',
      priceMin: '5000', priceMax: '20000', inStock: '1', sort: 'price-asc',
    })
    expect(c.query).toBe('cowrie')
    expect(c.materials).toEqual(['Brass', 'Cowrie shell'])
    expect(c.colors).toEqual(['Gold'])
    expect(c.badges).toEqual(['new'])
    expect(c.categories).toEqual(['jewelry'])
    expect(c.subcategory).toBe('necklaces')
    expect(c.priceMin).toBe(5000)
    expect(c.priceMax).toBe(20000)
    expect(c.inStock).toBe(true)
    expect(c.sort).toBe('price-asc')
  })

  it('tolerates malformed values', () => {
    const c = parseSearchCriteria({ priceMin: 'abc', sort: 'bogus', badge: ['new', 'fake'], q: '   ' })
    expect(c.priceMin).toBeUndefined()
    expect(c.sort).toBe('newest')
    expect(c.badges).toEqual(['new']) // unknown badge dropped
    expect(c.query).toBeUndefined()   // whitespace-only trimmed to undefined
  })
})

describe('toggleParamValue', () => {
  it('adds when absent, removes when present', () => {
    expect(toggleParamValue(['Brass'], 'Gold')).toEqual(['Brass', 'Gold'])
    expect(toggleParamValue(['Brass', 'Gold'], 'Brass')).toEqual(['Gold'])
  })
})
