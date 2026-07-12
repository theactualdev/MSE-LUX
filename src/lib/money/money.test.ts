import { describe, it, expect } from 'vitest'
import { resolveDisplayPrice } from '@/lib/money/resolve'
import { formatMoney } from '@/lib/money/format'
import type { PriceSet } from '@/types/money'

const prices: PriceSet = {
  ngn: { amountMinor: 1_500_000, currency: 'NGN' }, // ₦15,000.00
  usd: { amountMinor: 999, currency: 'USD' },       // $9.99
}

describe('resolveDisplayPrice', () => {
  it('returns the authored NGN price for a Nigerian viewer', () => {
    expect(resolveDisplayPrice(prices, 'NGN', {})).toEqual(prices.ngn)
  })
  it('returns the authored USD price for a US viewer', () => {
    expect(resolveDisplayPrice(prices, 'USD', {})).toEqual(prices.usd)
  })
  it('converts the authored USD price via FX for other locales', () => {
    const result = resolveDisplayPrice(prices, 'EUR', { EUR: 0.92 })
    expect(result).toEqual({ amountMinor: 919, currency: 'EUR' }) // round(999 * 0.92)
  })
  it('throws when the FX rate for the target is missing', () => {
    expect(() => resolveDisplayPrice(prices, 'GBP', {})).toThrow()
  })
  it('keeps amounts as integers after conversion', () => {
    const result = resolveDisplayPrice(prices, 'EUR', { EUR: 0.923456 })
    expect(Number.isInteger(result.amountMinor)).toBe(true)
  })
})

describe('formatMoney', () => {
  it('formats USD in en-US', () => {
    expect(formatMoney({ amountMinor: 999, currency: 'USD' }, 'en-US')).toBe('$9.99')
  })
  it('formats NGN with the naira symbol', () => {
    const out = formatMoney({ amountMinor: 1_500_000, currency: 'NGN' }, 'en-NG')
    expect(out).toContain('15,000.00')
  })
})
