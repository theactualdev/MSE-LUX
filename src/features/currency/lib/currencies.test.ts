import { describe, expect, it } from 'vitest'
import { currencyForCountry, localeForCurrency, isFxDerived, isSupportedCurrency, SUPPORTED_CURRENCIES, DEFAULT_CURRENCY } from './currencies'

describe('currencyForCountry', () => {
  it('maps the authored and known markets', () => {
    expect(currencyForCountry('NG')).toBe('NGN')
    expect(currencyForCountry('US')).toBe('USD')
    expect(currencyForCountry('GB')).toBe('GBP')
    expect(currencyForCountry('DE')).toBe('EUR') // EU member
    expect(currencyForCountry('FR')).toBe('EUR')
    expect(currencyForCountry('CA')).toBe('CAD')
    expect(currencyForCountry('GH')).toBe('GHS')
    expect(currencyForCountry('KE')).toBe('KES')
  })
  it('falls back to USD for a known-but-unsupported country', () => {
    expect(currencyForCountry('BR')).toBe('USD') // Brazil, not in the set
    expect(currencyForCountry('JP')).toBe('USD')
  })
  it('is case-insensitive and falls back to USD for absent/garbage input', () => {
    expect(currencyForCountry('ng')).toBe('NGN')
    expect(currencyForCountry(null)).toBe('USD')
    expect(currencyForCountry(undefined)).toBe('USD')
    expect(currencyForCountry('ZZ')).toBe('USD')
  })
})

describe('predicates + locale', () => {
  it('isFxDerived is true only for supported non-authored currencies', () => {
    expect(isFxDerived('NGN')).toBe(false)
    expect(isFxDerived('USD')).toBe(false)
    expect(isFxDerived('GBP')).toBe(true)
    expect(isFxDerived('EUR')).toBe(true)
  })
  it('isSupportedCurrency narrows the set', () => {
    expect(isSupportedCurrency('GBP')).toBe(true)
    expect(isSupportedCurrency('JPY')).toBe(false)
  })
  it('localeForCurrency returns a locale per supported currency', () => {
    expect(localeForCurrency('NGN')).toBe('en-NG')
    expect(localeForCurrency('USD')).toBe('en-US')
    expect(localeForCurrency('GBP')).toBe('en-GB')
    expect(SUPPORTED_CURRENCIES.every((c) => typeof localeForCurrency(c) === 'string')).toBe(true)
  })
  it('DEFAULT_CURRENCY is NGN (the unknown-geo fallback)', () => {
    expect(DEFAULT_CURRENCY).toBe('NGN')
  })
})
