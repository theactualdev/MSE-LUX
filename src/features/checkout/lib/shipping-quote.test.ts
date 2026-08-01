import { createHash, createHmac } from 'node:crypto'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Address } from '@/features/checkout/schema'
import type { ShippingQuotePayload } from '@/features/checkout/shipping-types'

beforeEach(() => {
  process.env.SHIPBUBBLE_QUOTE_SECRET = 'test-secret'
})

const { addressHash, newQuoteSalt, signQuote, verifyQuote } = await import('@/features/checkout/lib/shipping-quote')

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

const SALT = 'fixed-test-salt'

function makePayload(overrides: Partial<ShippingQuotePayload> = {}): ShippingQuotePayload {
  return {
    label: 'GIG Logistics — Express',
    amountMinor: 350_000,
    currency: 'NGN' as const,
    addressHash: addressHash(address, overrides.salt ?? SALT),
    salt: SALT,
    exp: Date.now() + 30 * 60 * 1000,
    scope: 'checkout' as const,
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

    expect(addressHash(a, SALT)).toBe(addressHash(b, SALT))
  })

  it('treats a missing postalCode/line2 as empty string (not undefined)', () => {
    const withEmptyPostal: Address = { ...address, postalCode: '' }
    const withoutPostal: Address = { ...address }
    delete (withoutPostal as { postalCode?: string }).postalCode

    expect(addressHash(withEmptyPostal, SALT)).toBe(addressHash(withoutPostal, SALT))
  })

  it('produces a different hash when line1 differs', () => {
    expect(addressHash(address, SALT)).not.toBe(addressHash({ ...address, line1: '99 Different Street' }, SALT))
  })

  it('produces a different hash when city differs', () => {
    expect(addressHash(address, SALT)).not.toBe(addressHash({ ...address, city: 'Lekki' }, SALT))
  })

  it('produces a different hash when state differs', () => {
    expect(addressHash(address, SALT)).not.toBe(addressHash({ ...address, state: 'Ogun' }, SALT))
  })

  it('produces a different hash when country differs', () => {
    expect(addressHash(address, SALT)).not.toBe(addressHash({ ...address, country: 'Ghana' }, SALT))
  })

  it('produces a different hash when postalCode differs', () => {
    expect(addressHash(address, SALT)).not.toBe(addressHash({ ...address, postalCode: '900001' }, SALT))
  })

  it('produces a different hash when the salt differs, for the SAME address', () => {
    expect(addressHash(address, SALT)).not.toBe(addressHash(address, 'a-different-salt'))
  })

  // Phase 10c fix: this digest travels inside the quote token, whose payload
  // the buyer's browser can read. Unsalted, it was an offline oracle — and on
  // the gift flow the buyer already knows city/state/country, leaving a
  // brute-forceable `line1`/`postalCode` and recovering the exact address the
  // feature exists to hide. It is now keyed with SHIPBUBBLE_QUOTE_SECRET.
  it('is KEYED: the same address hashes differently under a different secret', () => {
    const underTestSecret = addressHash(address, SALT)

    process.env.SHIPBUBBLE_QUOTE_SECRET = 'a-completely-different-secret'
    expect(addressHash(address, SALT)).not.toBe(underTestSecret)

    // ...and is stable again once the original secret is restored.
    process.env.SHIPBUBBLE_QUOTE_SECRET = 'test-secret'
    expect(addressHash(address, SALT)).toBe(underTestSecret)
  })

  it('is not the plain unsalted SHA-256 of the joined fields (the pre-fix oracle)', () => {
    const joined = [SALT, '12 adeola odeku street', 'victoria island', 'lagos', 'nigeria', '101241'].join('|')
    const unsalted = createHash('sha256').update(joined).digest('hex')

    // Sanity: that IS the exact string the digest is taken over...
    expect(createHmac('sha256', 'test-secret').update(joined).digest('hex')).toBe(addressHash(address, SALT))
    // ...and the unkeyed digest of it no longer matches, so a candidate
    // address can't be tested without the secret.
    expect(addressHash(address, SALT)).not.toBe(unsalted)
  })

  it('throws on a missing SHIPBUBBLE_QUOTE_SECRET, like every other function here', () => {
    delete process.env.SHIPBUBBLE_QUOTE_SECRET
    expect(() => addressHash(address, SALT)).toThrow(/SHIPBUBBLE_QUOTE_SECRET/)
  })

  // THE REGRESSION GUARD for the online-oracle fix: `getShippingRates` is a
  // public Server Action, so keying alone (the earlier fix) wasn't enough — a
  // caller holding a genuine token could mint their OWN token for a candidate
  // address and compare its `addressHash` against the one they already hold.
  // A random per-quote salt closes that: two tokens signed for the SAME
  // address must carry different salts and different hashes, yet each must
  // still verify against that address. If someone later removes the salt
  // (e.g. reverts to a fixed/shared salt), the two hashes below collapse to
  // the same value and this test fails.
  it('two tokens signed for the same address carry different salts and different hashes, and each still verifies', () => {
    const saltA = newQuoteSalt()
    const saltB = newQuoteSalt()
    expect(saltA).not.toBe(saltB)

    const hashA = addressHash(address, saltA)
    const hashB = addressHash(address, saltB)
    expect(hashA).not.toBe(hashB)

    const payloadA = makePayload({ addressHash: hashA, salt: saltA })
    const payloadB = makePayload({ addressHash: hashB, salt: saltB })

    const tokenA = signQuote(payloadA)
    const tokenB = signQuote(payloadB)

    expect(verifyQuote(tokenA, address)).toEqual(payloadA)
    expect(verifyQuote(tokenB, address)).toEqual(payloadB)
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
