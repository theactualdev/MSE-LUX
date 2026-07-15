import { describe, it, expect } from 'vitest'
import { computeCartSummary } from '@/features/cart/lib/summary'
import type { CartLine } from '@/features/cart/lib/lines'

const line = (amountMinor: number, qty: number): CartLine => ({
  product: {} as never, image: { src: '', alt: '' }, quantity: qty,
  unitPrice: { amountMinor, currency: 'NGN' },
  lineTotal: { amountMinor: amountMinor * qty, currency: 'NGN' },
})

describe('computeCartSummary', () => {
  it('sums subtotal, applies 7.5% tax, adds shipping', () => {
    const lines = [line(1_000_000, 2), line(500_000, 1)] // ₦25,000 subtotal
    const s = computeCartSummary(lines, { amountMinor: 250_000, currency: 'NGN' })
    expect(s.subtotal.amountMinor).toBe(2_500_000)
    expect(s.tax.amountMinor).toBe(Math.round(2_500_000 * 0.075)) // 187_500
    expect(s.shipping.amountMinor).toBe(250_000)
    expect(s.total.amountMinor).toBe(2_500_000 + 250_000 + 187_500)
  })
  it('keeps all amounts integer', () => {
    const s = computeCartSummary([line(999, 3)], { amountMinor: 250_000, currency: 'NGN' })
    for (const m of [s.subtotal, s.tax, s.shipping, s.total]) expect(Number.isInteger(m.amountMinor)).toBe(true)
  })
})
