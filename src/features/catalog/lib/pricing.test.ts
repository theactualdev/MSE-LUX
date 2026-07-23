import { describe, it, expect } from 'vitest'
import { resolveProductPrice } from '@/features/catalog/lib/pricing'
import type { Product } from '@/types/catalog'

const base = { ngn: { amountMinor: 1_500_000, currency: 'NGN' as const }, usd: { amountMinor: 1900, currency: 'USD' as const } }
const product = { priceSet: base, salePriceSet: undefined, variants: [] } as unknown as Product

describe('resolveProductPrice', () => {
  it('returns the NGN authored price with no sale', () => {
    const { price, sale } = resolveProductPrice(product, undefined, 'NGN', {})
    expect(price).toEqual(base.ngn)
    expect(sale).toBeNull()
  })
  it('uses a variant priceSet override when present', () => {
    const variant = { priceSet: { ngn: { amountMinor: 2_000_000, currency: 'NGN' as const }, usd: { amountMinor: 2500, currency: 'USD' as const } } } as never
    const { price } = resolveProductPrice({ ...product, variants: [variant] } as Product, variant, 'NGN', {})
    expect(price.amountMinor).toBe(2_000_000)
  })
  it('returns a sale price when salePriceSet is set', () => {
    const withSale = { ...product, salePriceSet: { ngn: { amountMinor: 1_200_000, currency: 'NGN' as const }, usd: { amountMinor: 1500, currency: 'USD' as const } } } as Product
    const { price, sale } = resolveProductPrice(withSale, undefined, 'NGN', {})
    expect(price).toEqual(base.ngn)
    expect(sale?.amountMinor).toBe(1_200_000)
  })
  it('converts to an FX currency using the provided rates', () => {
    const { price } = resolveProductPrice(product, undefined, 'GBP', { GBP: 0.8 })
    expect(price).toEqual({ amountMinor: 1520, currency: 'GBP' })
  })
  it('returns authored NGN/USD ignoring rates', () => {
    expect(resolveProductPrice(product, undefined, 'NGN', {}).price.currency).toBe('NGN')
  })
})
