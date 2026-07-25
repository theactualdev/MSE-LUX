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
  FLAT_INTERNATIONAL: { amountMinor: 250_000, currency: 'USD' as const, label: 'International shipping', deliveryEta: '7–14 days' },
  FLAT_FALLBACK_NGN: { amountMinor: 300_000, currency: 'NGN' as const, label: 'Standard delivery', deliveryEta: '3–5 days' },
  FLAT_FALLBACK_USD: { amountMinor: 260_000, currency: 'USD' as const, label: 'International shipping', deliveryEta: '7–14 days' },
  WEIGHT_BASE_GRAMS: 300,
  WEIGHT_PER_ITEM_GRAMS: 150,
  NOMINAL_DIMENSION: { length: 20, width: 15, height: 8 },
  SHIPBUBBLE_CATEGORY_ID: 0,
}))

const { getShippingRates } = await import('@/features/checkout/shipping')
const { verifyQuote } = await import('@/features/checkout/lib/shipping-quote')

beforeEach(() => {
  process.env.SHIPBUBBLE_QUOTE_SECRET = 'test-secret'
  configState.originAddressCode = 'origin-abc'
  vi.clearAllMocks()
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

const EMAIL = 'buyer@example.com'

describe('getShippingRates — Nigeria, signed-in', () => {
  beforeEach(() => {
    getCurrentUserId.mockResolvedValue(USER_ID)
    cartItem.findMany.mockResolvedValue([{ productId: PRODUCT_ID, variantId: null, quantity: 2 }])
    resolveProductsByIds.mockResolvedValue([PRODUCT])
    validateAddress.mockResolvedValue({ addressCode: 'recv-1' })
  })

  it('resolves the signed-in server cart, validates the address, fetches live rates, and returns one signed option per courier', async () => {
    fetchRates.mockResolvedValue([
      { courierId: 'courier_1', serviceCode: 'gig_standard', label: 'GIG Logistics', amountMinor: 350_000, currency: 'NGN', deliveryEta: '2-3 days' },
      { courierId: 'courier_2', serviceCode: 'dhl_express', label: 'DHL', amountMinor: 600_000, currency: 'NGN', deliveryEta: '1 day' },
    ])

    const options = await getShippingRates({ address: NG_ADDRESS, email: EMAIL })

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
    // weight = base(300) + perItem(150) * totalQuantity(2) = 600
    expect(call.packageItems).toEqual([
      { name: 'MSE Lux order', description: 'Jewelry order', unit_weight: 600, unit_amount: 1_000_000, quantity: 1 },
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
    fetchRates.mockResolvedValue([{ courierId: 'courier_1', serviceCode: 'gig_standard', label: 'GIG Logistics', amountMinor: 350_000, currency: 'NGN', deliveryEta: '2-3 days' }])

    const [option] = await getShippingRates({ address: NG_ADDRESS, email: EMAIL })

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
    fetchRates.mockResolvedValue([{ courierId: 'courier_1', serviceCode: 'gig_standard', label: 'GIG Logistics', amountMinor: 400_000, currency: 'NGN', deliveryEta: '2-3 days' }])

    const options = await getShippingRates({
      address: NG_ADDRESS,
      email: EMAIL,
      guestLines: [{ productId: PRODUCT_ID, quantity: 3 }],
    })

    expect(cartItem.findMany).not.toHaveBeenCalled()

    const call = fetchRates.mock.calls[0][0]
    // weight = base(300) + perItem(150) * 3 = 750; value = 500_000 * 3 = 1_500_000
    expect(call.packageItems).toEqual([{ name: 'MSE Lux order', description: 'Jewelry order', unit_weight: 750, unit_amount: 1_500_000, quantity: 1 }])

    expect(options).toHaveLength(1)
    expect(verifyQuote(options[0].token, NG_ADDRESS)).not.toBeNull()
  })
})

describe('getShippingRates — non-Nigeria', () => {
  it('returns exactly the flat international option and never calls ShipBubble', async () => {
    getCurrentUserId.mockResolvedValue(null)

    const options = await getShippingRates({ address: US_ADDRESS, email: EMAIL, guestLines: [{ productId: PRODUCT_ID, quantity: 1 }] })

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

    const options = await getShippingRates({ address: NG_ADDRESS, email: EMAIL })

    expect(options).toHaveLength(1)
    expect(options[0]).toMatchObject({ id: 'fallback', label: 'Standard delivery', amountMinor: 300_000, currency: 'NGN' })
    expect(verifyQuote(options[0].token, NG_ADDRESS)).not.toBeNull()
  })

  it('falls back when validateAddress throws', async () => {
    validateAddress.mockRejectedValue(new Error('unvalidatable address'))

    const options = await getShippingRates({ address: NG_ADDRESS, email: EMAIL })

    expect(fetchRates).not.toHaveBeenCalled()
    expect(options).toHaveLength(1)
    expect(options[0].id).toBe('fallback')
    expect(verifyQuote(options[0].token, NG_ADDRESS)).not.toBeNull()
  })

  it('falls back when fetchRates returns an empty courier list', async () => {
    validateAddress.mockResolvedValue({ addressCode: 'recv-4' })
    fetchRates.mockResolvedValue([])

    const options = await getShippingRates({ address: NG_ADDRESS, email: EMAIL })

    expect(options).toHaveLength(1)
    expect(options[0].id).toBe('fallback')
  })

  it('falls back to the flat rate — without calling validateAddress — when SHIPBUBBLE_ORIGIN_ADDRESS_CODE is blank', async () => {
    configState.originAddressCode = ''

    const options = await getShippingRates({ address: NG_ADDRESS, email: EMAIL })

    expect(validateAddress).not.toHaveBeenCalled()
    expect(fetchRates).not.toHaveBeenCalled()
    expect(options).toHaveLength(1)
    expect(options[0]).toMatchObject({ id: 'fallback', amountMinor: 300_000, currency: 'NGN' })
    expect(verifyQuote(options[0].token, NG_ADDRESS)).not.toBeNull()
  })
})
