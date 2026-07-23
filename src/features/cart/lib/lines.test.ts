import { describe, it, expect } from 'vitest'
import { buildCartLines } from '@/features/cart/lib/lines'
import { getAllProducts } from '@/features/catalog/lib/selectors'

describe('buildCartLines', () => {
  it('resolves a cart item to a line with unit + line totals', () => {
    const product = getAllProducts()[0]
    const lines = buildCartLines([{ productId: product.id, quantity: 2 }], [product], 'NGN')
    expect(lines).toHaveLength(1)
    expect(lines[0].product.id).toBe(product.id)
    expect(lines[0].lineTotal.amountMinor).toBe(lines[0].unitPrice.amountMinor * 2)
  })

  it('drops items whose product does not resolve from the given products array', () => {
    const product = getAllProducts()[0]
    const lines = buildCartLines([{ productId: 'nope', quantity: 1 }], [product], 'NGN')
    expect(lines).toEqual([])
  })
})
