import { beforeEach, describe, expect, it } from 'vitest'
import type { Address } from '@/features/checkout/schema'
import type { ShippingQuotePayload } from '@/features/checkout/shipping-types'

beforeEach(() => {
  process.env.SHIPBUBBLE_QUOTE_SECRET = 'test-secret'
})

const { addressHash, signQuote, verifyQuote } = await import('@/features/checkout/lib/shipping-quote')

const address: Address = {
  fullName: 'Ada Lovelace',
  phone: '+234 801 234 5678',
  line1: '12 Adeola Odeku Street',
  line2: 'Suite 4',
  city: 'Victoria Island',
  state: 'Lagos',
  country: 'Nigeria',
  postalCode: '101241',
}

function makePayload(overrides: Partial<ShippingQuotePayload> = {}): ShippingQuotePayload {
  return {
    label: 'GIG Logistics — Express',
    amountMinor: 350_000,
    currency: 'NGN' as const,
    addressHash: addressHash(address),
    exp: Date.now() + 30 * 60 * 1000,
    ...overrides,
  }
}

describe('addressHash', () => {
  it('is stable across whitespace/casing differences in the destination fields, and across name/phone/line2', () => {
    const a: Address = { ...address }
    const b: Address = {
      ...address,
      fullName: 'Someone Else',
      phone: '+1 555 000 0000',
      line2: 'A different unit',
      line1: '  12 ADEOLA odeku Street  ',
      city: 'victoria ISLAND',
      state: ' Lagos ',
      country: 'NIGERIA',
      postalCode: ' 101241 ',
    }

    expect(addressHash(a)).toBe(addressHash(b))
  })

  it('treats a missing postalCode/line2 as empty string (not undefined)', () => {
    const withEmptyPostal: Address = { ...address, postalCode: '' }
    const withoutPostal: Address = { ...address }
    delete (withoutPostal as { postalCode?: string }).postalCode

    expect(addressHash(withEmptyPostal)).toBe(addressHash(withoutPostal))
  })

  it('produces a different hash when line1 differs', () => {
    expect(addressHash(address)).not.toBe(addressHash({ ...address, line1: '99 Different Street' }))
  })

  it('produces a different hash when city differs', () => {
    expect(addressHash(address)).not.toBe(addressHash({ ...address, city: 'Lekki' }))
  })

  it('produces a different hash when state differs', () => {
    expect(addressHash(address)).not.toBe(addressHash({ ...address, state: 'Ogun' }))
  })

  it('produces a different hash when country differs', () => {
    expect(addressHash(address)).not.toBe(addressHash({ ...address, country: 'Ghana' }))
  })

  it('produces a different hash when postalCode differs', () => {
    expect(addressHash(address)).not.toBe(addressHash({ ...address, postalCode: '900001' }))
  })
})

describe('signQuote / verifyQuote round-trip', () => {
  it('verifies a freshly signed token against the same address', () => {
    const payload = makePayload()
    const token = signQuote(payload)

    expect(verifyQuote(token, address)).toEqual(payload)
  })

  it('rejects a tampered token (body mutated without re-signing)', () => {
    const payload = makePayload()
    const token = signQuote(payload)
    const [body, sig] = token.split('.')

    const tamperedPayload = { ...payload, amountMinor: 1 }
    const tamperedBody = Buffer.from(JSON.stringify(tamperedPayload)).toString('base64url')
    const tamperedToken = `${tamperedBody}.${sig}`

    expect(verifyQuote(tamperedToken, address)).toBeNull()
    // sanity: the original body really did change
    expect(tamperedBody).not.toBe(body)
  })

  it('rejects an expired token', () => {
    const payload = makePayload({ exp: Date.now() - 1000 })
    const token = signQuote(payload)

    expect(verifyQuote(token, address)).toBeNull()
  })

  it('rejects a token verified against a different address', () => {
    const payload = makePayload()
    const token = signQuote(payload)

    const otherAddress: Address = { ...address, line1: '1 Different Avenue', city: 'Ibadan' }

    expect(verifyQuote(token, otherAddress)).toBeNull()
  })

  it('rejects a malformed token (no separator)', () => {
    expect(verifyQuote('not-a-valid-token', address)).toBeNull()
  })

  it('rejects a malformed token (garbage body)', () => {
    const payload = makePayload()
    const token = signQuote(payload)
    const [, sig] = token.split('.')

    expect(verifyQuote(`not-valid-base64url-json.${sig}`, address)).toBeNull()
  })
})
