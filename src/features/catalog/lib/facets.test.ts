import { describe, expect, it } from 'vitest'
import type { Product } from '@/types/catalog'
import { allColors, allMaterialTags, getColorOptions, isInStock } from '@/features/catalog/lib/facets'

function make(partial: Partial<Product>): Product {
  return {
    id: 'x', name: 'x', slug: 'x', shortDescription: '', description: '',
    priceSet: { NGN: { amountMinor: 1000, currency: 'NGN' } } as unknown as Product['priceSet'],
    sku: 'x', inventory: 0, material: '', materialTags: [], categorySlug: 'c',
    collectionSlugs: [], images: [], optionTypes: [], variants: [], badges: [],
    status: 'active', seo: {}, ...partial,
  }
}

describe('isInStock', () => {
  it('variantless: true when inventory > 0', () => {
    expect(isInStock(make({ inventory: 3 }))).toBe(true)
    expect(isInStock(make({ inventory: 0 }))).toBe(false)
  })
  it('with variants: true when any variant has inventory', () => {
    const p = make({
      inventory: 0,
      variants: [
        { id: 'v1', sku: 's1', options: [], inventory: 0 },
        { id: 'v2', sku: 's2', options: [], inventory: 2 },
      ],
    })
    expect(isInStock(p)).toBe(true)
    const none = make({ inventory: 0, variants: [{ id: 'v1', sku: 's1', options: [], inventory: 0 }] })
    expect(isInStock(none)).toBe(false)
  })
})

describe('getColorOptions', () => {
  it('returns Color option values, else []', () => {
    const p = make({ optionTypes: [{ name: 'Size', values: ['S'] }, { name: 'Color', values: ['Gold', 'Silver'] }] })
    expect(getColorOptions(p)).toEqual(['Gold', 'Silver'])
    expect(getColorOptions(make({}))).toEqual([])
  })
})

describe('allMaterialTags / allColors', () => {
  it('sorted de-duplicated unions', () => {
    const products = [
      make({ materialTags: ['Brass', 'Recycled glass'], optionTypes: [{ name: 'Color', values: ['Gold'] }] }),
      make({ materialTags: ['Brass', 'Clay bead'], optionTypes: [{ name: 'Color', values: ['Gold', 'Coral'] }] }),
    ]
    expect(allMaterialTags(products)).toEqual(['Brass', 'Clay bead', 'Recycled glass'])
    expect(allColors(products)).toEqual(['Coral', 'Gold'])
  })
})
