import { describe, it, expect } from 'vitest'
import { TAX_RATE } from '@/features/cart/lib/shipping'

describe('TAX_RATE', () => {
  it('is a positive fraction used to compute cart tax', () => {
    expect(TAX_RATE).toBeGreaterThan(0)
    expect(TAX_RATE).toBeLessThan(1)
  })
})
