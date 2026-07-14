import { describe, it, expect } from 'vitest'
import { getCartLines } from '@/features/cart/lib/lines'
import { getAllProducts } from '@/features/catalog/lib/selectors'

describe('getCartLines', () => {
  it('resolves a cart item to a line with unit + line totals', () => {
    const product = getAllProducts()[0]
    const lines = getCartLines([{ productId: product.id, quantity: 2 }], 'NGN')
    expect(lines).toHaveLength(1)
    expect(lines[0].product.id).toBe(product.id)
    expect(lines[0].lineTotal.amountMinor).toBe(lines[0].unitPrice.amountMinor * 2)
  })
  it('drops items whose product no longer exists', () => {
    expect(getCartLines([{ productId: 'nope', quantity: 1 }], 'NGN')).toEqual([])
  })
})
