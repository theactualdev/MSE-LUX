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
const { verifyQuote } = await import('@/features/checkout/lib/shipping-quote')

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
      { name: 'MSE Lux order', description: 'Jewelry order', unit_weight: 800, unit_amount: 1_000_000, quantity: 1 },
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
    expect(call.packageItems).toEqual([{ name: 'MSE Lux order', description: 'Jewelry order', unit_weight: 1050, unit_amount: 1_500_000, quantity: 1 }])

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
    expect(call.packageItems).toEqual([{ name: 'MSE Lux order', description: 'Jewelry order', unit_weight: 1250, unit_amount: 2_500_000, quantity: 1 }])

    expect(options).toHaveLength(1)
    expect(verifyQuote(options[0].token, NG_ADDRESS)).not.toBeNull()
  })
})

describe('getShippingRates — quotes in the charge currency, not the address country', () => {
  // The core Phase-7 currency invariant: every returned option's currency
  // equals `chargeCurrency` (never the address's country), so `placeOrder`'s
  // `quote.currency !== input.chargeCurrency` guard always passes for a legit
  // flow. Live ShipBubble ₦ rates are ONLY used when charging NGN to a
  // Nigerian address; every other combination is a flat rate in `chargeCurrency`.

  it('USD charge + non-NG address → flat USD option, never calls ShipBubble', async () => {
    getCurrentUserId.mockResolvedValue(null)

    const options = await getShippingRates({ address: US_ADDRESS, email: EMAIL, chargeCurrency: 'USD', guestLines: [{ productId: PRODUCT_ID, quantity: 1 }] })

    expect(validateAddress).not.toHaveBeenCalled()
    expect(fetchRates).not.toHaveBeenCalled()
    expect(resolveProductsByIds).not.toHaveBeenCalled()
    expect(cartItem.findMany).not.toHaveBeenCalled()

    expect(options).toEqual([
      expect.objectContaining({ id: 'international', label: 'International shipping', amountMinor: 250_000, currency: 'USD', deliveryEta: '7–14 days' }),
    ])

    const payload = verifyQuote(options[0].token, US_ADDRESS)
    expect(payload).toMatchObject({ label: 'International shipping', amountMinor: 250_000, currency: 'USD' })
  })

  it('USD charge + NG address → flat USD option, never calls ShipBubble (its ₦ rates can’t be charged in USD)', async () => {
    getCurrentUserId.mockResolvedValue(null)

    const options = await getShippingRates({ address: NG_ADDRESS, email: EMAIL, chargeCurrency: 'USD', guestLines: [{ productId: PRODUCT_ID, quantity: 1 }] })

    expect(validateAddress).not.toHaveBeenCalled()
    expect(fetchRates).not.toHaveBeenCalled()

    expect(options).toEqual([
      expect.objectContaining({ id: 'international', amountMinor: 250_000, currency: 'USD' }),
    ])
    expect(verifyQuote(options[0].token, NG_ADDRESS)).toMatchObject({ currency: 'USD' })
  })

  it('NGN charge + non-NG address → flat NGN international option, never calls ShipBubble', async () => {
    getCurrentUserId.mockResolvedValue(null)

    const options = await getShippingRates({ address: US_ADDRESS, email: EMAIL, chargeCurrency: 'NGN', guestLines: [{ productId: PRODUCT_ID, quantity: 1 }] })

    expect(validateAddress).not.toHaveBeenCalled()
    expect(fetchRates).not.toHaveBeenCalled()

    expect(options).toEqual([
      expect.objectContaining({ id: 'international', label: 'International shipping', amountMinor: 500_000, currency: 'NGN' }),
    ])
    expect(verifyQuote(options[0].token, US_ADDRESS)).toMatchObject({ amountMinor: 500_000, currency: 'NGN' })
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

    const options = await getShippingRates({
      address: US_ADDRESS,
      email: EMAIL,
      chargeCurrency: 'USD',
      guestLines: [{ productId: PRODUCT_ID, quantity: 1 }],
    })

    expect(options).toEqual([
      expect.objectContaining({ id: 'international', label: 'International shipping', amountMinor: 250_000, currency: 'USD' }),
    ])
    expect(verifyQuote(options[0].token, US_ADDRESS)).toMatchObject({ currency: 'USD' })
    expect(consoleWarnSpy).not.toHaveBeenCalled()

    consoleWarnSpy.mockRestore()
  })
})
