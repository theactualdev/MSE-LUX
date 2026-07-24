import { describe, it, expect } from 'vitest'
import { shippingMethods, shippingAmountFor } from '@/features/cart/lib/shipping'

describe('shippingAmountFor', () => {
  it('resolves a shipping method amount in the charge currency', () => {
    const m = shippingMethods[0]
    expect(shippingAmountFor(m, 'NGN')).toEqual(m.amount)
    expect(shippingAmountFor(m, 'USD')).toEqual(m.amountUsd)
    expect(shippingAmountFor(m, 'USD').currency).toBe('USD')
  })
})
