import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Product } from '@/types/catalog'
import type { Address } from '@/features/checkout/schema'

/**
 * `shipping-quote.ts` is kept REAL (not mocked) — the whole point of these
 * tests is that `getShippingRates`'s options carry tokens that actually
 * verify (and are actually bound to the amount/address), so we need the real
 * HMAC sign/verify round-trip, not a stub. Everything else (db, claims,
 * resolve-products, the ShipBubble REST client, and the tunable config) is
 * mocked, mirroring `data.test.ts`'s idiom for the identical cart-resolution
 * shape `placeOrder` uses.
 */

const cartItem = { findMany: vi.fn() }
vi.mock('@/lib/db', () => ({ db: { get cartItem() { return cartItem } } }))

const getCurrentUserId = vi.fn()
vi.mock('@/features/auth/claims', () => ({ getCurrentUserId: () => getCurrentUserId() }))

const resolveProductsByIds = vi.fn()
vi.mock('@/features/catalog/server/resolve-products', () => ({
  resolveProductsByIds: (...args: [string[]]) => resolveProductsByIds(...args),
}))

const validateAddress = vi.fn()
const fetchRates = vi.fn()
vi.mock('@/features/checkout/lib/shipbubble', () => ({
  validateAddress: (...args: [unknown]) => validateAddress(...args),
  fetchRates: (...args: [unknown]) => fetchRates(...args),
}))

// A mutable config double so a single test can flip
// `SHIPBUBBLE_ORIGIN_ADDRESS_CODE` to '' to exercise the "not configured"
// fallback branch without touching real env (the real config module reads
// `process.env` once at import time, so stubbing env wouldn't be observed by
// an already-imported module anyway).
const configState = vi.hoisted(() => ({ originAddressCode: 'origin-abc' }))
vi.mock('@/features/checkout/lib/shipping-config', () => ({
  get SHIPBUBBLE_ORIGIN_ADDRESS_CODE() {
    return configState.originAddressCode
  },
  FLAT_INTERNATIONAL_USD: { amountMinor: 250_000, currency: 'USD' as const, label: 'International shipping', deliveryEta: '7–14 days' },
  FLAT_INTERNATIONAL_NGN: { amountMinor: 500_000, currency: 'NGN' as const, label: 'International shipping', deliveryEta: '7–14 days' },
  FLAT_FALLBACK_NGN: { amountMinor: 300_000, currency: 'NGN' as const, label: 'Standard delivery', deliveryEta: '3–5 days' },
  FLAT_FALLBACK_USD: { amountMinor: 260_000, currency: 'USD' as const, label: 'International shipping', deliveryEta: '7–14 days' },
  WEIGHT_BASE_GRAMS: 300,
  WEIGHT_PER_ITEM_GRAMS: 150,
  NOMINAL_DIMENSION: { length: 20, width: 15, height: 8 },
  SHIPBUBBLE_CATEGORY_ID: 0,
}))

// FX is stubbed at a round 1000 NGN/USD so the expected amounts below are
// readable, and so nothing here performs a real network call to the rate feed.
// The conversion itself (margin, rounding, backstop) is covered in
// `shipping-fx.test.ts`.
vi.mock('@/features/checkout/lib/shipping-fx', () => ({
  getUsdNgnRate: async () => ({ rate: 1000, source: 'live' as const }),
  usdMinorFromNgnMinor: (ngnMinor: number) => Math.ceil((ngnMinor / 100 / 1000) * 1.05 * 100),
}))

const checkRateLimit = vi.fn()
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: (...args: unknown[]) => checkRateLimit(...args),
  RATE_LIMITS: { payment: { limit: 10, windowSeconds: 60 }, checkout: { limit: 20, windowSeconds: 60 }, shippingQuote: { limit: 60, windowSeconds: 60 }, search: { limit: 120, windowSeconds: 60 }, auth: { limit: 40, windowSeconds: 300 }, authIdentity: { limit: 5, windowSeconds: 300 }, verify: { limit: 60, windowSeconds: 60 } },
}))

// `serverChargeCurrency` (Phase 9c) reads the geo header through
// `next/headers`, mocked here per the project's idiom (`src/lib/rate-limit.test.ts`).
const headersMock = vi.fn()
vi.mock('next/headers', () => ({ headers: (...args: unknown[]) => headersMock(...args) }))

function headerStore(entries: Record<string, string> = {}) {
  const h = new Headers()
  for (const [key, value] of Object.entries(entries)) h.set(key, value)
  return h
}

const { getShippingRates } = await import('@/features/checkout/shipping')
// The non-action engine behind both quote flows. Imported REAL (nothing about
// it is mocked) so the scope/shareRef block below can exercise the gift stamp
// the way `getGiftShippingRates` does — through a plain function argument that
// no HTTP request can reach — rather than through the public action.
const { buildShippingRates } = await import('@/features/checkout/lib/shipping-rates')
const { verifyQuote, shareRefFor } = await import('@/features/checkout/lib/shipping-quote')

beforeEach(() => {
  process.env.SHIPBUBBLE_QUOTE_SECRET = 'test-secret'
  configState.originAddressCode = 'origin-abc'
  vi.clearAllMocks()
  // Default the limiter to "allow" so every pre-existing test below keeps
  // exercising real behaviour untouched; the rate-limit describe block below
  // overrides this per-test.
  checkRateLimit.mockResolvedValue(true)
  // Default to NO geo header (`serverChargeCurrency` resolves `null`), so
  // every pre-existing test below keeps exercising today's client
  // `chargeCurrency` unchanged; the currency-divergence describe block below
  // overrides this per-test.
  headersMock.mockResolvedValue(headerStore())
})

afterEach(() => {
  delete process.env.SHIPBUBBLE_QUOTE_SECRET
})

const USER_ID = '11111111-1111-4111-8111-111111111111'
const PRODUCT_ID = 'prod-1'

const PRODUCT: Product = {
  id: PRODUCT_ID,
  name: 'Gold Signet Ring',
  slug: 'gold-signet-ring',
  shortDescription: '',
  description: '',
  priceSet: {
    ngn: { amountMinor: 500_000, currency: 'NGN' },
    usd: { amountMinor: 30_000, currency: 'USD' },
  },
  sku: 'SKU-1',
  inventory: 5,
  weightGrams: 250,
  material: 'Gold',
  materialTags: [],
  categorySlug: 'rings',
  collectionSlugs: [],
  images: [{ src: '/gold-ring.jpg', alt: 'Gold Signet Ring' }],
  optionTypes: [],
  variants: [],
  badges: [],
  status: 'active',
  seo: {},
}

const NG_ADDRESS: Address = {
  fullName: 'Ada Lovelace',
  phone: '+234 801 234 5678',
  line1: '12 Adeola Odeku Street',
  city: 'Victoria Island',
  state: 'Lagos',
  country: 'Nigeria',
  postalCode: '101241',
}

const US_ADDRESS: Address = {
  fullName: 'Grace Hopper',
  phone: '+1 555 000 0000',
  line1: '1 Infinite Loop',
  city: 'Cupertino',
  state: 'CA',
  country: 'United States',
  postalCode: '95014',
}

const PRODUCT_ID_2 = 'prod-2'

/** A second product with no `weightGrams` set — its line falls back to the flat per-item estimate. */
const PRODUCT_NO_WEIGHT: Product = {
  ...PRODUCT,
  id: PRODUCT_ID_2,
  sku: 'SKU-2',
  weightGrams: undefined,
}

const EMAIL = 'buyer@example.com'

describe('getShippingRates — Nigeria, signed-in', () => {
  beforeEach(() => {
    getCurrentUserId.mockResolvedValue(USER_ID)
    cartItem.findMany.mockResolvedValue([{ productId: PRODUCT_ID, variantId: null, quantity: 2 }])
    resolveProductsByIds.mockResolvedValue([PRODUCT])
    validateAddress.mockResolvedValue({ addressCode: 'recv-1' })
  })

  it('resolves the signed-in server cart, validates the address, fetches live rates, and returns one signed option per courier', async () => {
    fetchRates.mockResolvedValue({
      requestToken: 'req_tok_1',
      rates: [
        { courierId: 'courier_1', serviceCode: 'gig_standard', label: 'GIG Logistics', amountMinor: 350_000, currency: 'NGN', deliveryEta: '2-3 days' },
        { courierId: 'courier_2', serviceCode: 'dhl_express', label: 'DHL', amountMinor: 600_000, currency: 'NGN', deliveryEta: '1 day' },
      ],
    })

    const options = await getShippingRates({ address: NG_ADDRESS, email: EMAIL, chargeCurrency: 'NGN' })

    // Cart resolved from the SERVER cart (never guestLines) for a signed-in caller.
    expect(cartItem.findMany).toHaveBeenCalledWith({
      where: { cart: { profileId: USER_ID } },
      select: { productId: true, variantId: true, quantity: true },
    })

    expect(validateAddress).toHaveBeenCalledWith({
      name: NG_ADDRESS.fullName,
      email: EMAIL,
      phone: NG_ADDRESS.phone,
      address: '12 Adeola Odeku Street, Victoria Island, Lagos, Nigeria',
    })

    expect(fetchRates).toHaveBeenCalledTimes(1)
    const call = fetchRates.mock.calls[0][0]
    expect(call.senderAddressCode).toBe('origin-abc')
    expect(call.receiverAddressCode).toBe('recv-1')
    expect(call.packageDimension).toEqual({ length: 20, width: 15, height: 8 })
    // weight = base(300) + PRODUCT.weightGrams(250) * quantity(2) = 800
    expect(call.packageItems).toEqual([
      { name: 'MSE Lux order', description: 'Jewelry order', unitWeightGrams: 800, unitAmountMinor: 1_000_000, quantity: 1 },
    ])
    expect(call.pickupDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)

    expect(options).toHaveLength(2)

    expect(options[0]).toMatchObject({ id: 'courier_1:gig_standard', label: 'GIG Logistics', amountMinor: 350_000, currency: 'NGN', deliveryEta: '2-3 days' })
    expect(options[1]).toMatchObject({ id: 'courier_2:dhl_express', label: 'DHL', amountMinor: 600_000, currency: 'NGN', deliveryEta: '1 day' })

    for (const option of options) {
      const payload = verifyQuote(option.token, NG_ADDRESS)
      expect(payload).not.toBeNull()
      expect(payload).toMatchObject({ label: option.label, amountMinor: option.amountMinor, currency: option.currency })
    }
  })

  it('is authoritative: a tampered amount on a genuine option fails verification', async () => {
    fetchRates.mockResolvedValue({ requestToken: 'req_tok_1', rates: [{ courierId: 'courier_1', serviceCode: 'gig_standard', label: 'GIG Logistics', amountMinor: 350_000, currency: 'NGN', deliveryEta: '2-3 days' }] })

    const [option] = await getShippingRates({ address: NG_ADDRESS, email: EMAIL, chargeCurrency: 'NGN' })

    const [body, sig] = option.token.split('.')
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
    const tamperedBody = Buffer.from(JSON.stringify({ ...payload, amountMinor: 1 })).toString('base64url')
    const tamperedToken = `${tamperedBody}.${sig}`

    expect(verifyQuote(tamperedToken, NG_ADDRESS)).toBeNull()
    // sanity: the real (untampered) token still verifies with the real amount
    expect(verifyQuote(option.token, NG_ADDRESS)).toMatchObject({ amountMinor: 350_000 })
  })
})

describe('getShippingRates — guest', () => {
  it('uses guestLines (not the server cart) to build the package, and still returns signed options', async () => {
    getCurrentUserId.mockResolvedValue(null)
    resolveProductsByIds.mockResolvedValue([PRODUCT])
    validateAddress.mockResolvedValue({ addressCode: 'recv-2' })
    fetchRates.mockResolvedValue({ requestToken: 'req_tok_1', rates: [{ courierId: 'courier_1', serviceCode: 'gig_standard', label: 'GIG Logistics', amountMinor: 400_000, currency: 'NGN', deliveryEta: '2-3 days' }] })

    const options = await getShippingRates({
      address: NG_ADDRESS,
      email: EMAIL,
      chargeCurrency: 'NGN',
      guestLines: [{ productId: PRODUCT_ID, quantity: 3 }],
    })

    expect(cartItem.findMany).not.toHaveBeenCalled()

    const call = fetchRates.mock.calls[0][0]
    // weight = base(300) + PRODUCT.weightGrams(250) * 3 = 1050; value = 500_000 * 3 = 1_500_000
    expect(call.packageItems).toEqual([{ name: 'MSE Lux order', description: 'Jewelry order', unitWeightGrams: 1050, unitAmountMinor: 1_500_000, quantity: 1 }])

    expect(options).toHaveLength(1)
    expect(verifyQuote(options[0].token, NG_ADDRESS)).not.toBeNull()
  })

  it('mixes weighed and unweighed products: a weighed line uses its real weightGrams, an unweighed line falls back to the flat per-item estimate', async () => {
    getCurrentUserId.mockResolvedValue(null)
    resolveProductsByIds.mockResolvedValue([PRODUCT, PRODUCT_NO_WEIGHT])
    validateAddress.mockResolvedValue({ addressCode: 'recv-2' })
    fetchRates.mockResolvedValue({ requestToken: 'req_tok_1', rates: [{ courierId: 'courier_1', serviceCode: 'gig_standard', label: 'GIG Logistics', amountMinor: 400_000, currency: 'NGN', deliveryEta: '2-3 days' }] })

    const options = await getShippingRates({
      address: NG_ADDRESS,
      email: EMAIL,
      chargeCurrency: 'NGN',
      guestLines: [
        { productId: PRODUCT_ID, quantity: 2 },
        { productId: PRODUCT_ID_2, quantity: 3 },
      ],
    })

    const call = fetchRates.mock.calls[0][0]
    // weight = base(300) + PRODUCT.weightGrams(250)*2 + WEIGHT_PER_ITEM_GRAMS(150)*3 = 1250
    // value = 500_000*2 + 500_000*3 = 2_500_000
    expect(call.packageItems).toEqual([{ name: 'MSE Lux order', description: 'Jewelry order', unitWeightGrams: 1250, unitAmountMinor: 2_500_000, quantity: 1 }])

    expect(options).toHaveLength(1)
    expect(verifyQuote(options[0].token, NG_ADDRESS)).not.toBeNull()
  })
})

describe('getShippingRates — explicit `lines` override (the gift flow, Phase 10c)', () => {
  it('uses the supplied lines verbatim and never consults the session or the cart', async () => {
    // A SIGNED-IN caller with a non-empty server cart of their own: the
    // override must make both irrelevant, otherwise a gift would be quoted
    // against the buyer's own basket.
    getCurrentUserId.mockResolvedValue(USER_ID)
    cartItem.findMany.mockResolvedValue([{ productId: PRODUCT_ID_2, variantId: null, quantity: 9 }])
    resolveProductsByIds.mockResolvedValue([PRODUCT])
    validateAddress.mockResolvedValue({ addressCode: 'recv-3' })
    fetchRates.mockResolvedValue({ requestToken: 'req_tok_1', rates: [{ courierId: 'courier_1', serviceCode: 'gig_standard', label: 'GIG Logistics', amountMinor: 400_000, currency: 'NGN', deliveryEta: '2-3 days' }] })

    const options = await getShippingRates({
      address: NG_ADDRESS,
      email: EMAIL,
      chargeCurrency: 'NGN',
      lines: [{ productId: PRODUCT_ID, quantity: 1 }],
    })

    // Neither data source `resolveRawLines` would have read was touched.
    expect(getCurrentUserId).not.toHaveBeenCalled()
    expect(cartItem.findMany).not.toHaveBeenCalled()

    // The package is sized from the SUPPLIED line only:
    // weight = base(300) + PRODUCT.weightGrams(250) * 1 = 550; value = 500_000 * 1
    expect(resolveProductsByIds).toHaveBeenCalledWith([PRODUCT_ID])
    const call = fetchRates.mock.calls[0][0]
    expect(call.packageItems).toEqual([{ name: 'MSE Lux order', description: 'Jewelry order', unitWeightGrams: 550, unitAmountMinor: 500_000, quantity: 1 }])

    expect(options).toHaveLength(1)
    expect(verifyQuote(options[0].token, NG_ADDRESS)).not.toBeNull()
  })

  it('ignores guestLines entirely when an override is present', async () => {
    getCurrentUserId.mockResolvedValue(null)
    resolveProductsByIds.mockResolvedValue([PRODUCT])
    validateAddress.mockResolvedValue({ addressCode: 'recv-4' })
    fetchRates.mockResolvedValue({ requestToken: 'req_tok_1', rates: [{ courierId: 'courier_1', serviceCode: 'gig_standard', label: 'GIG Logistics', amountMinor: 400_000, currency: 'NGN', deliveryEta: '2-3 days' }] })

    await getShippingRates({
      address: NG_ADDRESS,
      email: EMAIL,
      chargeCurrency: 'NGN',
      guestLines: [{ productId: PRODUCT_ID, quantity: 8 }],
      lines: [{ productId: PRODUCT_ID, quantity: 2 }],
    })

    // weight = base(300) + 250 * 2 = 800 (the override's quantity, not guestLines' 8)
    const call = fetchRates.mock.calls[0][0]
    expect(call.packageItems).toEqual([{ name: 'MSE Lux order', description: 'Jewelry order', unitWeightGrams: 800, unitAmountMinor: 1_000_000, quantity: 1 }])
  })
})

describe('getShippingRates — quotes in the charge currency, not the address country', () => {
  // The core Phase-7 currency invariant: every returned option's currency
  // equals `chargeCurrency` (never the address's country), so `placeOrder`'s
  // `quote.currency !== input.chargeCurrency` guard always passes for a legit
  // flow. Live ShipBubble ₦ rates are ONLY used when charging NGN to a
  // Nigerian address; every other combination is a flat rate in `chargeCurrency`.

  // Previously this asserted a flat $25 and that ShipBubble was never called.
  // USD now takes the same live path as NGN, with the naira amount converted;
  // only the CHARGE CURRENCY differs, not whether couriers are quoted.
  it('USD charge + non-NG address → live rates, converted to USD', async () => {
    getCurrentUserId.mockResolvedValue(null)
    resolveProductsByIds.mockResolvedValue([PRODUCT])
    validateAddress.mockResolvedValue({ addressCode: 'addr_us_1' })
    fetchRates.mockResolvedValue({
      requestToken: 'req_tok_usd',
      rates: [{ courierId: 'topship', serviceCode: 'aramex', label: 'Topship (Aramex)', amountMinor: 350_000, currency: 'NGN', deliveryEta: '5-9 days' }],
    })

    const options = await getShippingRates({ address: US_ADDRESS, email: EMAIL, chargeCurrency: 'USD', guestLines: [{ productId: PRODUCT_ID, quantity: 1 }] })

    expect(validateAddress).toHaveBeenCalled()
    expect(fetchRates).toHaveBeenCalled()

    // ₦3,500 at 1000/$ is $3.50; +5% margin is $3.675, rounded up to $3.68.
    expect(options).toEqual([
      expect.objectContaining({ label: 'Topship (Aramex)', amountMinor: 368, currency: 'USD' }),
    ])

    // The token must carry the CONVERTED amount — `placeOrder` charges what
    // the token says, so a token still holding the naira figure would bill a
    // dollar customer ₦3,500 worth of dollars.
    const payload = verifyQuote(options[0].token, US_ADDRESS)
    expect(payload).toMatchObject({ label: 'Topship (Aramex)', amountMinor: 368, currency: 'USD' })
  })

  // A dollar-paying customer shipping WITHIN Nigeria used to be quoted the
  // international flat, which was never right — it is a domestic parcel that
  // happens to be paid for in dollars. It now gets the real domestic couriers,
  // converted.
  it('USD charge + NG address → live domestic rates, converted to USD', async () => {
    getCurrentUserId.mockResolvedValue(null)
    resolveProductsByIds.mockResolvedValue([PRODUCT])
    validateAddress.mockResolvedValue({ addressCode: 'addr_ng_1' })
    fetchRates.mockResolvedValue({
      requestToken: 'req_tok_ng_usd',
      rates: [{ courierId: 'fez', serviceCode: 'std', label: 'Fez delivery', amountMinor: 331_400, currency: 'NGN', deliveryEta: '1-4 days' }],
    })

    const options = await getShippingRates({ address: NG_ADDRESS, email: EMAIL, chargeCurrency: 'USD', guestLines: [{ productId: PRODUCT_ID, quantity: 1 }] })

    expect(fetchRates).toHaveBeenCalled()
    // ₦3,314 at 1000/$ is $3.314; +5% is $3.4797, rounded up to $3.48.
    expect(options).toEqual([
      expect.objectContaining({ label: 'Fez delivery', amountMinor: 348, currency: 'USD' }),
    ])
    expect(verifyQuote(options[0].token, NG_ADDRESS)).toMatchObject({ currency: 'USD' })
  })

  // This test used to assert the exact opposite — that an NGN order to a
  // non-Nigerian address got a flat ₦5,000 and never called ShipBubble. That
  // belief came from the sandbox, which returns destination-blind stub rates.
  // Production quotes international routes from Lagos for real: 0.45 kg to New
  // York returns 7 couriers, cheapest ₦78,475 via Aramex. The flat rate was
  // undercharging by roughly ₦73,000 on exactly the store's most valuable
  // orders.
  it('NGN charge + non-NG address → LIVE ShipBubble rates, in NGN', async () => {
    getCurrentUserId.mockResolvedValue(null)
    resolveProductsByIds.mockResolvedValue([PRODUCT])
    validateAddress.mockResolvedValue({ addressCode: 'addr_us_1' })
    fetchRates.mockResolvedValue({
      requestToken: 'req_tok_intl',
      rates: [
        { courierId: 'topship', serviceCode: 'aramex', label: 'Topship (Aramex)', amountMinor: 7_847_475, currency: 'NGN', deliveryEta: '5-9 days' },
      ],
    })

    const options = await getShippingRates({ address: US_ADDRESS, email: EMAIL, chargeCurrency: 'NGN', guestLines: [{ productId: PRODUCT_ID, quantity: 1 }] })

    expect(validateAddress).toHaveBeenCalled()
    expect(fetchRates).toHaveBeenCalled()

    expect(options).toEqual([
      expect.objectContaining({ label: 'Topship (Aramex)', amountMinor: 7_847_475, currency: 'NGN' }),
    ])
    expect(verifyQuote(options[0].token, US_ADDRESS)).toMatchObject({ amountMinor: 7_847_475, currency: 'NGN' })
  })

  // The outage path is where this change could quietly lose money: before it,
  // every NGN request that reached a fallback was domestic by construction, so
  // the domestic flat was always right. Now an international NGN order that
  // fails at ShipBubble must NOT be handed the ₦2,500 domestic rate.
  it('NGN charge + non-NG address: a ShipBubble failure falls back to the INTERNATIONAL flat, not the domestic one', async () => {
    getCurrentUserId.mockResolvedValue(null)
    resolveProductsByIds.mockResolvedValue([PRODUCT])
    validateAddress.mockRejectedValue(new Error('ShipBubble down'))

    const options = await getShippingRates({ address: US_ADDRESS, email: EMAIL, chargeCurrency: 'NGN', guestLines: [{ productId: PRODUCT_ID, quantity: 1 }] })

    expect(options).toHaveLength(1)
    expect(options[0]).toMatchObject({ amountMinor: 500_000, currency: 'NGN' })
    expect(options[0].amountMinor).not.toBe(300_000) // the domestic fallback
    expect(verifyQuote(options[0].token, US_ADDRESS)).not.toBeNull()
  })

  it('NGN charge + NG address: a ShipBubble failure still falls back to the DOMESTIC flat', async () => {
    getCurrentUserId.mockResolvedValue(null)
    resolveProductsByIds.mockResolvedValue([PRODUCT])
    validateAddress.mockRejectedValue(new Error('ShipBubble down'))

    const options = await getShippingRates({ address: NG_ADDRESS, email: EMAIL, chargeCurrency: 'NGN', guestLines: [{ productId: PRODUCT_ID, quantity: 1 }] })

    expect(options[0]).toMatchObject({ amountMinor: 300_000, currency: 'NGN' })
  })

  it('the invariant holds across every branch: every option.currency === chargeCurrency and its token verifies', async () => {
    getCurrentUserId.mockResolvedValue(null)
    resolveProductsByIds.mockResolvedValue([PRODUCT])
    validateAddress.mockResolvedValue({ addressCode: 'recv-inv' })
    fetchRates.mockResolvedValue({ requestToken: 'req_tok_1', rates: [{ courierId: 'courier_1', serviceCode: 'gig_standard', label: 'GIG Logistics', amountMinor: 350_000, currency: 'NGN', deliveryEta: '2-3 days' }] })

    const combos = [
      { address: NG_ADDRESS, chargeCurrency: 'NGN' as const },
      { address: NG_ADDRESS, chargeCurrency: 'USD' as const },
      { address: US_ADDRESS, chargeCurrency: 'NGN' as const },
      { address: US_ADDRESS, chargeCurrency: 'USD' as const },
    ]

    for (const { address, chargeCurrency } of combos) {
      const options = await getShippingRates({ address, email: EMAIL, chargeCurrency, guestLines: [{ productId: PRODUCT_ID, quantity: 1 }] })
      expect(options.length).toBeGreaterThanOrEqual(1)
      for (const option of options) {
        expect(option.currency).toBe(chargeCurrency)
        const payload = verifyQuote(option.token, address)
        expect(payload).not.toBeNull()
        expect(payload!.currency).toBe(chargeCurrency)
      }
    }
  })
})

describe('getShippingRates — the PUBLIC action can never mint a gift-scoped token', () => {
  // THE REGRESSION GUARD for the address-oracle fix, round 3. `scope` used to
  // be a field of this action's input — but `shipping.ts` is a `'use server'`
  // module, so every argument of every export comes off the wire: an attacker
  // could POST `scope: 'gift'` with an address of their own choosing, get a
  // validly-signed gift-scoped token back, and probe `placeGiftOrder` with it.
  // The action now hardcodes `'checkout'`; a smuggled `scope` key is simply
  // never read. Every branch is covered because a single unguarded branch
  // would be enough to mint the token.
  //
  // The `as never` casts below are the point of the test, not a workaround:
  // they simulate a raw HTTP caller, for whom the compile-time signature does
  // not exist.

  it('defaults to scope "checkout" when the caller omits it', async () => {
    getCurrentUserId.mockResolvedValue(null)

    const options = await getShippingRates({ address: US_ADDRESS, email: EMAIL, chargeCurrency: 'USD', guestLines: [{ productId: PRODUCT_ID, quantity: 1 }] })

    expect(options).toHaveLength(1)
    expect(verifyQuote(options[0].token, US_ADDRESS)).toMatchObject({ scope: 'checkout' })
  })

  it('IGNORES a smuggled `scope: "gift"` on the flat international branch', async () => {
    getCurrentUserId.mockResolvedValue(null)

    const options = await getShippingRates({
      address: US_ADDRESS,
      email: EMAIL,
      chargeCurrency: 'USD',
      guestLines: [{ productId: PRODUCT_ID, quantity: 1 }],
      scope: 'gift',
    } as never)

    expect(options).toHaveLength(1)
    expect(verifyQuote(options[0].token, US_ADDRESS)).toMatchObject({ scope: 'checkout' })
  })

  it('IGNORES a smuggled `scope: "gift"` on a live ShipBubble-rate option', async () => {
    getCurrentUserId.mockResolvedValue(null)
    resolveProductsByIds.mockResolvedValue([PRODUCT])
    validateAddress.mockResolvedValue({ addressCode: 'recv-scope' })
    fetchRates.mockResolvedValue({ requestToken: 'req_tok_1', rates: [{ courierId: 'courier_1', serviceCode: 'gig_standard', label: 'GIG Logistics', amountMinor: 350_000, currency: 'NGN', deliveryEta: '2-3 days' }] })

    const options = await getShippingRates({ address: NG_ADDRESS, email: EMAIL, chargeCurrency: 'NGN', guestLines: [{ productId: PRODUCT_ID, quantity: 1 }], scope: 'gift' } as never)

    expect(options).toHaveLength(1)
    expect(verifyQuote(options[0].token, NG_ADDRESS)).toMatchObject({ scope: 'checkout' })
  })

  it('IGNORES a smuggled `scope: "gift"` on the flat NGN fallback (ShipBubble outage path)', async () => {
    getCurrentUserId.mockResolvedValue(null)
    resolveProductsByIds.mockResolvedValue([PRODUCT])
    validateAddress.mockResolvedValue({ addressCode: 'recv-scope-2' })
    fetchRates.mockRejectedValue(new Error('ShipBubble is down'))

    const options = await getShippingRates({ address: NG_ADDRESS, email: EMAIL, chargeCurrency: 'NGN', guestLines: [{ productId: PRODUCT_ID, quantity: 1 }], scope: 'gift' } as never)

    expect(options).toHaveLength(1)
    expect(options[0].id).toBe('fallback')
    expect(verifyQuote(options[0].token, NG_ADDRESS)).toMatchObject({ scope: 'checkout' })
  })

  it('IGNORES a smuggled `scope: "gift"` on the guardFallbackOption path (malformed address)', async () => {
    const malformedAddress = { ...NG_ADDRESS, country: undefined } as unknown as Address

    const options = await getShippingRates({ address: malformedAddress, email: EMAIL, chargeCurrency: 'NGN', scope: 'gift' } as never)

    expect(options).toHaveLength(1)
    expect(options[0].id).toBe('fallback')
    expect(verifyQuote(options[0].token, malformedAddress)).toMatchObject({ scope: 'checkout' })
  })

  it('IGNORES a smuggled `scope: "gift"` on the rate-limited international branch', async () => {
    checkRateLimit.mockResolvedValue(false)

    const options = await getShippingRates({ address: US_ADDRESS, email: EMAIL, chargeCurrency: 'USD', scope: 'gift' } as never)

    expect(options).toHaveLength(1)
    expect(options[0].id).toBe('international')
    expect(verifyQuote(options[0].token, US_ADDRESS)).toMatchObject({ scope: 'checkout' })
  })

  it('IGNORES a smuggled `scope: "gift"` on the rate-limited domestic fallback', async () => {
    checkRateLimit.mockResolvedValue(false)
    getCurrentUserId.mockResolvedValue(USER_ID)

    const options = await getShippingRates({ address: NG_ADDRESS, email: EMAIL, chargeCurrency: 'NGN', scope: 'gift' } as never)

    expect(options).toHaveLength(1)
    expect(options[0].id).toBe('fallback')
    expect(verifyQuote(options[0].token, NG_ADDRESS)).toMatchObject({ scope: 'checkout' })
  })

  it('never puts a shareRef on a checkout token — a checkout quote belongs to no share', async () => {
    getCurrentUserId.mockResolvedValue(null)

    const options = await getShippingRates({ address: US_ADDRESS, email: EMAIL, chargeCurrency: 'USD', shareRef: 'forged', scope: 'gift' } as never)

    expect(verifyQuote(options[0].token, US_ADDRESS)).toMatchObject({ scope: 'checkout' })
    expect(verifyQuote(options[0].token, US_ADDRESS)!.shareRef).toBeUndefined()
  })
})

describe('buildShippingRates — the gift stamp travels on every branch', () => {
  // The gift stamp (`{ scope: 'gift', shareRef }`) is a SEPARATE ARGUMENT of
  // this non-action function, which is why `getGiftShippingRates` calls it
  // directly instead of going through the public action above. These are the
  // tests the old "stamps scope gift" block used to run against the action,
  // moved to the only surface that can still set the stamp — plus the
  // `shareRef` assertion, since a branch that dropped it would silently make
  // `placeGiftOrder`'s share binding unenforceable for that branch.

  const GIFT_STAMP = { scope: 'gift' as const, shareRef: 'share-ref-abc' }

  it('stamps a flat international option', async () => {
    getCurrentUserId.mockResolvedValue(null)

    const options = await buildShippingRates({ address: US_ADDRESS, email: EMAIL, chargeCurrency: 'USD', guestLines: [{ productId: PRODUCT_ID, quantity: 1 }] }, GIFT_STAMP)

    expect(options).toHaveLength(1)
    expect(verifyQuote(options[0].token, US_ADDRESS)).toMatchObject({ scope: 'gift', shareRef: 'share-ref-abc' })
  })

  it('stamps a live ShipBubble-rate option', async () => {
    getCurrentUserId.mockResolvedValue(null)
    resolveProductsByIds.mockResolvedValue([PRODUCT])
    validateAddress.mockResolvedValue({ addressCode: 'recv-scope' })
    fetchRates.mockResolvedValue({ requestToken: 'req_tok_1', rates: [{ courierId: 'courier_1', serviceCode: 'gig_standard', label: 'GIG Logistics', amountMinor: 350_000, currency: 'NGN', deliveryEta: '2-3 days' }] })

    const options = await buildShippingRates({ address: NG_ADDRESS, email: EMAIL, chargeCurrency: 'NGN', guestLines: [{ productId: PRODUCT_ID, quantity: 1 }] }, GIFT_STAMP)

    expect(options).toHaveLength(1)
    expect(verifyQuote(options[0].token, NG_ADDRESS)).toMatchObject({ scope: 'gift', shareRef: 'share-ref-abc' })
  })

  it('stamps the flat NGN fallback option (ShipBubble outage path)', async () => {
    getCurrentUserId.mockResolvedValue(null)
    resolveProductsByIds.mockResolvedValue([PRODUCT])
    validateAddress.mockResolvedValue({ addressCode: 'recv-scope-2' })
    fetchRates.mockRejectedValue(new Error('ShipBubble is down'))

    const options = await buildShippingRates({ address: NG_ADDRESS, email: EMAIL, chargeCurrency: 'NGN', guestLines: [{ productId: PRODUCT_ID, quantity: 1 }] }, GIFT_STAMP)

    expect(options).toHaveLength(1)
    expect(options[0].id).toBe('fallback')
    expect(verifyQuote(options[0].token, NG_ADDRESS)).toMatchObject({ scope: 'gift', shareRef: 'share-ref-abc' })
  })

  it('stamps the guardFallbackOption path (malformed address)', async () => {
    const malformedAddress = { ...NG_ADDRESS, country: undefined } as unknown as Address

    const options = await buildShippingRates({ address: malformedAddress, email: EMAIL, chargeCurrency: 'NGN' }, GIFT_STAMP)

    expect(options).toHaveLength(1)
    expect(options[0].id).toBe('fallback')
    expect(verifyQuote(options[0].token, malformedAddress)).toMatchObject({ scope: 'gift', shareRef: 'share-ref-abc' })
  })

  it('stamps the rate-limited international-branch option', async () => {
    checkRateLimit.mockResolvedValue(false)

    const options = await buildShippingRates({ address: US_ADDRESS, email: EMAIL, chargeCurrency: 'USD' }, GIFT_STAMP)

    expect(options).toHaveLength(1)
    expect(options[0].id).toBe('international')
    expect(verifyQuote(options[0].token, US_ADDRESS)).toMatchObject({ scope: 'gift', shareRef: 'share-ref-abc' })
  })

  it('stamps the rate-limited domestic-fallback option', async () => {
    checkRateLimit.mockResolvedValue(false)
    getCurrentUserId.mockResolvedValue(USER_ID)

    const options = await buildShippingRates({ address: NG_ADDRESS, email: EMAIL, chargeCurrency: 'NGN' }, GIFT_STAMP)

    expect(options).toHaveLength(1)
    expect(options[0].id).toBe('fallback')
    expect(verifyQuote(options[0].token, NG_ADDRESS)).toMatchObject({ scope: 'gift', shareRef: 'share-ref-abc' })
  })

  it('a real shareRef is unforgeable without the secret and differs per share token', () => {
    const refA = shareRefFor('share-token-a')
    const refB = shareRefFor('share-token-b')

    expect(refA).not.toBe(refB)
    expect(refA).toMatch(/^[0-9a-f]{64}$/)
    // Stable for the same token under the same secret — mint time and spend
    // time must agree or every legitimate gift purchase would fail.
    expect(shareRefFor('share-token-a')).toBe(refA)
    // ...and keyed: a different secret gives a different reference.
    process.env.SHIPBUBBLE_QUOTE_SECRET = 'a-different-secret'
    expect(shareRefFor('share-token-a')).not.toBe(refA)
  })
})

describe('getShippingRates — fallback', () => {
  beforeEach(() => {
    getCurrentUserId.mockResolvedValue(USER_ID)
    cartItem.findMany.mockResolvedValue([{ productId: PRODUCT_ID, variantId: null, quantity: 1 }])
    resolveProductsByIds.mockResolvedValue([PRODUCT])
  })

  it('falls back to the flat NGN rate when fetchRates throws, without throwing out', async () => {
    validateAddress.mockResolvedValue({ addressCode: 'recv-3' })
    fetchRates.mockRejectedValue(new Error('ShipBubble is down'))

    const options = await getShippingRates({ address: NG_ADDRESS, email: EMAIL, chargeCurrency: 'NGN' })

    expect(options).toHaveLength(1)
    expect(options[0]).toMatchObject({ id: 'fallback', label: 'Standard delivery', amountMinor: 300_000, currency: 'NGN' })
    expect(verifyQuote(options[0].token, NG_ADDRESS)).not.toBeNull()
  })

  it('falls back when validateAddress throws', async () => {
    validateAddress.mockRejectedValue(new Error('unvalidatable address'))

    const options = await getShippingRates({ address: NG_ADDRESS, email: EMAIL, chargeCurrency: 'NGN' })

    expect(fetchRates).not.toHaveBeenCalled()
    expect(options).toHaveLength(1)
    expect(options[0].id).toBe('fallback')
    expect(verifyQuote(options[0].token, NG_ADDRESS)).not.toBeNull()
  })

  it('falls back when fetchRates returns an empty courier list', async () => {
    validateAddress.mockResolvedValue({ addressCode: 'recv-4' })
    fetchRates.mockResolvedValue({ requestToken: 'req_tok_1', rates: [] })

    const options = await getShippingRates({ address: NG_ADDRESS, email: EMAIL, chargeCurrency: 'NGN' })

    expect(options).toHaveLength(1)
    expect(options[0].id).toBe('fallback')
    expect(verifyQuote(options[0].token, NG_ADDRESS)).not.toBeNull()
  })

  it('falls back — without throwing — when cart resolution itself throws (e.g. a db error)', async () => {
    validateAddress.mockResolvedValue({ addressCode: 'recv-5' })
    cartItem.findMany.mockRejectedValue(new Error('db unavailable'))

    const options = await getShippingRates({ address: NG_ADDRESS, email: EMAIL, chargeCurrency: 'NGN' })

    expect(options).toHaveLength(1)
    expect(options[0].id).toBe('fallback')
    expect(verifyQuote(options[0].token, NG_ADDRESS)).not.toBeNull()
  })

  it('falls back to the flat rate — without calling validateAddress — when SHIPBUBBLE_ORIGIN_ADDRESS_CODE is blank', async () => {
    configState.originAddressCode = ''

    const options = await getShippingRates({ address: NG_ADDRESS, email: EMAIL, chargeCurrency: 'NGN' })

    expect(validateAddress).not.toHaveBeenCalled()
    expect(fetchRates).not.toHaveBeenCalled()
    expect(options).toHaveLength(1)
    expect(options[0]).toMatchObject({ id: 'fallback', amountMinor: 300_000, currency: 'NGN' })
    expect(verifyQuote(options[0].token, NG_ADDRESS)).not.toBeNull()
  })
})

describe('getShippingRates — robustness against a malformed address', () => {
  // `getShippingRates` is a public Server Action: its args are NOT
  // runtime-validated by the framework, so a direct/malformed POST can
  // arrive with a broken `address` shape. It must never throw — it must
  // still return a single safe, verifiable fallback option.

  it('returns a fallback option (never throws) when address.country is missing', async () => {
    const malformedAddress = { ...NG_ADDRESS, country: undefined } as unknown as Address

    const options = await getShippingRates({ address: malformedAddress, email: EMAIL, chargeCurrency: 'NGN' })

    expect(options.length).toBeGreaterThanOrEqual(1)
    expect(options[0].id).toBe('fallback')
    expect(validateAddress).not.toHaveBeenCalled()
    expect(fetchRates).not.toHaveBeenCalled()
    expect(verifyQuote(options[0].token, malformedAddress)).not.toBeNull()
  })

  it('returns a fallback option (never throws) when address itself is null', async () => {
    const options = await getShippingRates({ address: null as unknown as Address, email: EMAIL, chargeCurrency: 'NGN' })

    expect(options.length).toBeGreaterThanOrEqual(1)
    expect(options[0].id).toBe('fallback')
    expect(validateAddress).not.toHaveBeenCalled()
    expect(fetchRates).not.toHaveBeenCalled()
  })

  // I1 (Phase 9c final fixes): `getShippingRates` is a public Server Action —
  // a caller can POST with no body at all, making `input` itself `undefined`
  // at this boundary. Before the fix, `input.chargeCurrency` threw inside the
  // top-level try, and the catch's own `guardFallbackOption(input.address,
  // input.chargeCurrency)` threw a SECOND time on the same nullish `input`,
  // escaping as an unhandled rejection despite this function's documented
  // "never throws" contract.
  it('never throws — resolves to an array — when input itself is undefined', async () => {
    await expect(getShippingRates(undefined as never)).resolves.toEqual(expect.any(Array))
  })

  // I2 (Phase 9c re-review): a PRESENT but WRONG-TYPED address field reaches
  // the same "double-throw" hazard through a different door. `addressSchema`
  // rejects it (falls into `guardFallbackOption`), but `safeAddressHash` only
  // guarded against `address` itself not being an object — a non-string
  // field (e.g. `line1: 123`) still threw inside `addressHash`'s
  // `(value ?? '').trim()`, which escaped through `guardFallbackOption`,
  // through the outer try, and threw AGAIN identically from the top-level
  // catch's own last-resort `guardFallbackOption` call — an unhandled
  // rejection despite this function's documented "never throws" contract.
  it.each([
    ['a non-string line1', { line1: 123, city: 'Lagos' }],
    ['a non-string, non-null city', { city: {} }],
    ['address itself is an array', [] as unknown],
  ])('never rejects — resolves to an array — when %s', async (_label, malformedAddress) => {
    await expect(
      getShippingRates({ address: malformedAddress, email: EMAIL, chargeCurrency: 'NGN' } as never),
    ).resolves.toEqual(expect.any(Array))
  })
})

describe('getShippingRates — rate limiting (the "shippingQuote" window)', () => {
  // A shipping quote is not worth breaking checkout over: `getShippingRates`
  // never throws, so a limit hit must degrade EXACTLY like a ShipBubble
  // outage — the same flat-fallback option array, not an empty list.

  it('NGN charge: limited returns the same flat NGN fallback the ShipBubble-outage path returns, touching nothing else', async () => {
    checkRateLimit.mockResolvedValue(false)
    getCurrentUserId.mockResolvedValue(USER_ID)

    const options = await getShippingRates({ address: NG_ADDRESS, email: EMAIL, chargeCurrency: 'NGN', guestLines: [{ productId: PRODUCT_ID, quantity: 1 }] })

    expect(checkRateLimit).toHaveBeenCalledWith('shippingQuote')
    expect(options).toHaveLength(1)
    expect(options[0]).toMatchObject({ id: 'fallback', label: 'Standard delivery', amountMinor: 300_000, currency: 'NGN' })
    expect(verifyQuote(options[0].token, NG_ADDRESS)).not.toBeNull()

    expect(getCurrentUserId).not.toHaveBeenCalled()
    expect(cartItem.findMany).not.toHaveBeenCalled()
    expect(resolveProductsByIds).not.toHaveBeenCalled()
    expect(validateAddress).not.toHaveBeenCalled()
    expect(fetchRates).not.toHaveBeenCalled()
  })

  // Fix (re-review round 2): a USD charge ALWAYS takes the international
  // branch in the real (un-limited) path, regardless of address — so the
  // limited path must match, not fall to the flat fallback. The generalized
  // condition (`chargeCurrency !== 'NGN' || !isNigeria(...)`) mirrors the
  // real branch's own condition exactly, rather than special-casing NGN, so
  // this can't silently regress the moment `FLAT_INTERNATIONAL_USD` and
  // `FLAT_FALLBACK_USD` (currently equal only by coincidence) are tuned to
  // different values.
  it('USD charge: limited returns the signed FLAT_INTERNATIONAL_USD option, not the flat fallback', async () => {
    checkRateLimit.mockResolvedValue(false)

    const options = await getShippingRates({ address: US_ADDRESS, email: EMAIL, chargeCurrency: 'USD' })

    expect(options).toHaveLength(1)
    expect(options[0]).toMatchObject({ id: 'international', label: 'International shipping', currency: 'USD', amountMinor: 250_000 })

    const payload = verifyQuote(options[0].token, US_ADDRESS)
    expect(payload).not.toBeNull()
    expect(payload).toMatchObject({ label: 'International shipping', amountMinor: 250_000, currency: 'USD' })

    expect(fetchRates).not.toHaveBeenCalled()
  })

  // Fix 1: the rate-limited fallback must be destination-aware — an NGN
  // charge to a NON-Nigerian address must get the INTERNATIONAL flat rate,
  // never the (half-price, mislabeled) domestic FLAT_FALLBACK_NGN.
  it('NGN charge + non-NG address: limited returns the signed FLAT_INTERNATIONAL_NGN option, not the domestic fallback', async () => {
    checkRateLimit.mockResolvedValue(false)

    const options = await getShippingRates({ address: US_ADDRESS, email: EMAIL, chargeCurrency: 'NGN', guestLines: [{ productId: PRODUCT_ID, quantity: 1 }] })

    expect(checkRateLimit).toHaveBeenCalledWith('shippingQuote')
    expect(options).toHaveLength(1)
    expect(options[0]).toMatchObject({ id: 'international', label: 'International shipping', amountMinor: 500_000, currency: 'NGN' })

    const payload = verifyQuote(options[0].token, US_ADDRESS)
    expect(payload).not.toBeNull()
    expect(payload).toMatchObject({ label: 'International shipping', amountMinor: 500_000, currency: 'NGN' })

    expect(getCurrentUserId).not.toHaveBeenCalled()
    expect(cartItem.findMany).not.toHaveBeenCalled()
    expect(resolveProductsByIds).not.toHaveBeenCalled()
    expect(validateAddress).not.toHaveBeenCalled()
    expect(fetchRates).not.toHaveBeenCalled()
  })

  it('NGN charge + NG address: limited still returns the flat domestic fallback, exactly as before', async () => {
    checkRateLimit.mockResolvedValue(false)
    getCurrentUserId.mockResolvedValue(USER_ID)

    const options = await getShippingRates({ address: NG_ADDRESS, email: EMAIL, chargeCurrency: 'NGN' })

    expect(options).toHaveLength(1)
    expect(options[0]).toMatchObject({ id: 'fallback', label: 'Standard delivery', amountMinor: 300_000, currency: 'NGN' })
    expect(verifyQuote(options[0].token, NG_ADDRESS)).not.toBeNull()
  })

  it('malformed address: limited still falls through to guardFallbackOption unchanged', async () => {
    checkRateLimit.mockResolvedValue(false)
    const malformedAddress = { ...NG_ADDRESS, country: undefined } as unknown as Address

    const options = await getShippingRates({ address: malformedAddress, email: EMAIL, chargeCurrency: 'NGN' })

    expect(options).toHaveLength(1)
    expect(options[0].id).toBe('fallback')
    expect(verifyQuote(options[0].token, malformedAddress)).not.toBeNull()
  })
})

describe('getShippingRates — SHIPBUBBLE_QUOTE_SECRET missing (the QA-reported 500)', () => {
  // Every option this function returns is signed — including the top-level
  // catch's own last-resort `guardFallbackOption` call. Before the fix, a
  // missing secret made THAT call throw a second time, escaping as an
  // unhandled rejection despite the function's documented "never throws"
  // contract. These assert the fix holds across the different paths that
  // all ultimately funnel into that same top-level catch.

  it('resolves with [] (never rejects) when the live-ShipBubble fallback itself cannot be signed — the exact QA-reported 500', async () => {
    delete process.env.SHIPBUBBLE_QUOTE_SECRET
    getCurrentUserId.mockResolvedValue(USER_ID)
    cartItem.findMany.mockResolvedValue([{ productId: PRODUCT_ID, variantId: null, quantity: 1 }])
    resolveProductsByIds.mockResolvedValue([PRODUCT])
    validateAddress.mockResolvedValue({ addressCode: 'recv-1' })
    fetchRates.mockRejectedValue(new Error('ShipBubble is down'))
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(
      getShippingRates({ address: NG_ADDRESS, email: EMAIL, chargeCurrency: 'NGN' }),
    ).resolves.toEqual([])

    expect(consoleErrorSpy).toHaveBeenCalled()
    consoleErrorSpy.mockRestore()
  })

  it('resolves with [] for the flat-rate (non-ShipBubble) branch too, when the secret is missing', async () => {
    delete process.env.SHIPBUBBLE_QUOTE_SECRET
    getCurrentUserId.mockResolvedValue(null)
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(
      getShippingRates({ address: US_ADDRESS, email: EMAIL, chargeCurrency: 'USD', guestLines: [{ productId: PRODUCT_ID, quantity: 1 }] }),
    ).resolves.toEqual([])

    expect(validateAddress).not.toHaveBeenCalled()
    expect(fetchRates).not.toHaveBeenCalled()
    consoleErrorSpy.mockRestore()
  })

  it('resolves with [] on the rate-limited path too, when the secret is missing', async () => {
    delete process.env.SHIPBUBBLE_QUOTE_SECRET
    checkRateLimit.mockResolvedValue(false)
    getCurrentUserId.mockResolvedValue(USER_ID)
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(
      getShippingRates({ address: NG_ADDRESS, email: EMAIL, chargeCurrency: 'NGN' }),
    ).resolves.toEqual([])

    consoleErrorSpy.mockRestore()
  })

  it('resolves with [] on the malformed-address path too, when the secret is missing', async () => {
    delete process.env.SHIPBUBBLE_QUOTE_SECRET
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const malformedAddress = { ...NG_ADDRESS, country: undefined } as unknown as Address

    await expect(
      getShippingRates({ address: malformedAddress, email: EMAIL, chargeCurrency: 'NGN' }),
    ).resolves.toEqual([])

    consoleErrorSpy.mockRestore()
  })

  it('still signs real options normally once the secret is present again', async () => {
    // Sanity check that the fix above didn't accidentally disable signing
    // altogether — with the secret present (restored by the outer
    // `beforeEach` on the NEXT test), a normal call still returns a signed,
    // verifiable option. Exercised inline here rather than relying on test
    // order.
    process.env.SHIPBUBBLE_QUOTE_SECRET = 'test-secret'
    getCurrentUserId.mockResolvedValue(null)

    const options = await getShippingRates({ address: US_ADDRESS, email: EMAIL, chargeCurrency: 'USD', guestLines: [{ productId: PRODUCT_ID, quantity: 1 }] })

    expect(options).toHaveLength(1)
    expect(verifyQuote(options[0].token, US_ADDRESS)).not.toBeNull()
  })
})

describe('getShippingRates — charge-currency divergence is logged, not overridden (Phase 9c Task 4)', () => {
  // Mirrors `placeOrder`'s (`data.test.ts`) equivalent block: `getShippingRates`
  // used to re-derive the charge currency from the server geo signal and
  // override the client's value on a divergence. That's been reverted —
  // it now ALWAYS uses `input.chargeCurrency`, driving both the
  // NGN-vs-international branching and the signed quote's currency, and only
  // logs (never acts on) a divergence against the server signal.

  it('always uses the client currency end-to-end even when the server signal diverges, returning options in that currency and logging the divergence', async () => {
    getCurrentUserId.mockResolvedValue(USER_ID)
    cartItem.findMany.mockResolvedValue([{ productId: PRODUCT_ID, variantId: null, quantity: 1 }])
    resolveProductsByIds.mockResolvedValue([PRODUCT])
    validateAddress.mockResolvedValue({ addressCode: 'recv-1' })
    fetchRates.mockResolvedValue({
      requestToken: 'req_tok_1',
      rates: [{ courierId: 'courier_1', serviceCode: 'gig_standard', label: 'GIG Logistics', amountMinor: 350_000, currency: 'NGN', deliveryEta: '2-3 days' }],
    })
    headersMock.mockResolvedValue(headerStore({ 'x-vercel-ip-country': 'US' })) // -> USD server-side
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    // Client claims NGN to a Nigerian address; the server signal says USD.
    // The effective currency must stay NGN, so this still takes the live
    // ShipBubble branch (NGN charge + Nigerian address) rather than being
    // forced into the flat international-USD branch.
    const options = await getShippingRates({
      address: NG_ADDRESS,
      email: EMAIL,
      chargeCurrency: 'NGN',
      guestLines: [{ productId: PRODUCT_ID, quantity: 1 }],
    })

    expect(validateAddress).toHaveBeenCalled()
    expect(fetchRates).toHaveBeenCalled()

    expect(options).toHaveLength(1)
    expect(options[0]).toMatchObject({ id: 'courier_1:gig_standard', currency: 'NGN', amountMinor: 350_000 })
    const payload = verifyQuote(options[0].token, NG_ADDRESS)
    expect(payload).toMatchObject({ amountMinor: 350_000, currency: 'NGN' })

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      '[getShippingRates] charge-currency divergence — logging only, using the client currency',
      { client: 'NGN', server: 'USD' },
    )

    consoleWarnSpy.mockRestore()
  })

  it('keeps the client currency unchanged, without logging, when the server-derived value agrees', async () => {
    getCurrentUserId.mockResolvedValue(USER_ID)
    cartItem.findMany.mockResolvedValue([{ productId: PRODUCT_ID, variantId: null, quantity: 1 }])
    resolveProductsByIds.mockResolvedValue([PRODUCT])
    validateAddress.mockResolvedValue({ addressCode: 'recv-1' })
    fetchRates.mockResolvedValue({
      requestToken: 'req_tok_1',
      rates: [{ courierId: 'courier_1', serviceCode: 'gig_standard', label: 'GIG Logistics', amountMinor: 350_000, currency: 'NGN', deliveryEta: '2-3 days' }],
    })
    headersMock.mockResolvedValue(headerStore({ 'x-vercel-ip-country': 'NG' })) // -> NGN, same as client
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const options = await getShippingRates({ address: NG_ADDRESS, email: EMAIL, chargeCurrency: 'NGN' })

    expect(options).toHaveLength(1)
    expect(options[0]).toMatchObject({ id: 'courier_1:gig_standard', currency: 'NGN', amountMinor: 350_000 })
    expect(verifyQuote(options[0].token, NG_ADDRESS)).toMatchObject({ currency: 'NGN' })
    expect(consoleWarnSpy).not.toHaveBeenCalled()

    consoleWarnSpy.mockRestore()
  })

  it('keeps the client currency unchanged when the geo header is absent (local dev / non-Vercel) — today’s behaviour', async () => {
    getCurrentUserId.mockResolvedValue(null)
    headersMock.mockResolvedValue(headerStore())
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    resolveProductsByIds.mockResolvedValue([PRODUCT])
    validateAddress.mockResolvedValue({ addressCode: 'addr_geo' })
    fetchRates.mockResolvedValue({
      requestToken: 'req_tok_geo',
      rates: [{ courierId: 'c1', serviceCode: 's1', label: 'Courier', amountMinor: 350_000, currency: 'NGN', deliveryEta: '5-9 days' }],
    })

    const options = await getShippingRates({
      address: US_ADDRESS,
      email: EMAIL,
      chargeCurrency: 'USD',
      guestLines: [{ productId: PRODUCT_ID, quantity: 1 }],
    })

    // The client's chosen currency is honoured; the amount is the converted
    // live rate rather than a flat one.
    expect(options).toEqual([expect.objectContaining({ currency: 'USD', amountMinor: 368 })])
    expect(verifyQuote(options[0].token, US_ADDRESS)).toMatchObject({ currency: 'USD' })
    expect(consoleWarnSpy).not.toHaveBeenCalled()

    consoleWarnSpy.mockRestore()
  })
})
