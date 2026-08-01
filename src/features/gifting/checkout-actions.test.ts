import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { signQuote, addressHash } from '@/features/checkout/lib/shipping-quote'
import type { Product } from '@/types/catalog'
import type { Address } from '@/features/checkout/schema'
import type { ResolvedShare } from '@/features/gifting/share'

/**
 * THE SECURITY PROPERTY UNDER TEST: neither gift action accepts a
 * destination. `createGiftOrder` is kept REAL here (only the DB, the catalog
 * lookup and `next/headers` are doubled) precisely so these tests can assert
 * on the `ship*` fields that actually reach `order.create` — the point is not
 * that an address argument is ignored by a mock, it's that the ROW is written
 * with the owner's address no matter what the caller sent.
 *
 * `shipping-quote` is real too, so the address-bound token round-trip is
 * genuine HMAC, not a stub: a quote minted for another destination has to
 * actually fail verification.
 */

const order = vi.hoisted(() => ({ create: vi.fn() }))
const $transaction = vi.hoisted(() => vi.fn(async (fn: (tx: unknown) => unknown) => fn({ order })))
vi.mock('@/lib/db', () => ({ db: { order, $transaction } }))

const resolveProductsByIds = vi.hoisted(() => vi.fn())
vi.mock('@/features/catalog/server/resolve-products', () => ({
  resolveProductsByIds: (...args: [string[]]) => resolveProductsByIds(...args),
}))

const cookieStore = vi.hoisted(() => ({ set: vi.fn(), get: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: vi.fn(async () => cookieStore) }))

const resolveShare = vi.hoisted(() => vi.fn())
vi.mock('@/features/gifting/share', () => ({ resolveShare: (...args: [string]) => resolveShare(...args) }))

const checkRateLimit = vi.hoisted(() => vi.fn())
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: (...args: unknown[]) => checkRateLimit(...args),
  RATE_LIMITED_MESSAGE: 'Too many attempts. Please wait a moment and try again.',
}))

const getShippingRates = vi.hoisted(() => vi.fn())
vi.mock('@/features/checkout/shipping', () => ({ getShippingRates: (...args: [unknown]) => getShippingRates(...args) }))

const { getGiftShippingRates, placeGiftOrder } = await import('@/features/gifting/checkout-actions')

const OWNER_ADDRESS = {
  fullName: 'Adaeze Okonkwo',
  phone: '+2348000000000',
  line1: '14 Adeola Odeku Street',
  line2: null,
  city: 'Victoria Island',
  state: 'Lagos',
  country: 'Nigeria',
  postalCode: '101241',
}

const SHARE: ResolvedShare = {
  wishlistId: 'w1',
  recipientFirstName: 'Adaeze',
  city: 'Victoria Island',
  state: 'Lagos',
  country: 'Nigeria',
  address: OWNER_ADDRESS,
  productIds: ['p1', 'p2'],
}

/** The `Address` shape the actions must derive from the share — used to mint genuine quote tokens below. */
const OWNER_AS_ADDRESS: Address = {
  fullName: OWNER_ADDRESS.fullName,
  phone: OWNER_ADDRESS.phone,
  line1: OWNER_ADDRESS.line1,
  line2: undefined,
  city: OWNER_ADDRESS.city,
  state: OWNER_ADDRESS.state,
  country: OWNER_ADDRESS.country,
  postalCode: OWNER_ADDRESS.postalCode,
}

/** A completely different destination — the one an attacking buyer would want their gift redirected to. */
const BUYER_ADDRESS: Address = {
  fullName: 'Mallory Buyer',
  phone: '+15550000000',
  line1: '1 Attacker Way',
  city: 'Lekki',
  state: 'Lagos',
  country: 'Nigeria',
  postalCode: '106104',
}

const P1: Product = {
  id: 'p1',
  name: 'Coral Strand',
  slug: 'coral-strand',
  shortDescription: '',
  description: '',
  priceSet: { ngn: { amountMinor: 100_000, currency: 'NGN' }, usd: { amountMinor: 6_000, currency: 'USD' } },
  sku: 'SKU-1',
  inventory: 5,
  material: 'Coral',
  materialTags: [],
  categorySlug: 'necklaces',
  collectionSlugs: [],
  images: [{ src: '/coral.jpg', alt: 'Coral Strand' }],
  optionTypes: [],
  variants: [],
  badges: [],
  status: 'active',
  seo: {},
}

function quoteFor(address: Address, currency: 'NGN' | 'USD' = 'NGN', amountMinor = 250_000, scope: 'checkout' | 'gift' = 'gift'): string {
  const salt = 'fixed-test-salt'
  return signQuote({
    label: 'Standard',
    amountMinor,
    currency,
    addressHash: addressHash(address, salt),
    salt,
    exp: Date.now() + 60_000,
    scope,
  })
}

beforeEach(() => {
  process.env.SHIPBUBBLE_QUOTE_SECRET = 'test-secret'
  vi.clearAllMocks()
  checkRateLimit.mockResolvedValue(true)
  resolveShare.mockResolvedValue(SHARE)
  resolveProductsByIds.mockResolvedValue([P1])
  getShippingRates.mockResolvedValue([])
  order.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    ...data,
    id: 'o1',
    lines: [],
  }))
})

afterEach(() => {
  delete process.env.SHIPBUBBLE_QUOTE_SECRET
})

describe('rate limiting (the wishlistShare window)', () => {
  it('getGiftShippingRates: a limited request neither resolves the share nor quotes', async () => {
    checkRateLimit.mockResolvedValue(false)

    const options = await getGiftShippingRates({
      shareToken: 'tok',
      selections: [{ productId: 'p1', variantId: null }],
      email: 'buyer@example.com',
      chargeCurrency: 'NGN',
    })

    expect(options).toEqual([])
    expect(checkRateLimit).toHaveBeenCalledWith('wishlistShare')
    expect(resolveShare).not.toHaveBeenCalled()
    expect(getShippingRates).not.toHaveBeenCalled()
  })

  it('placeGiftOrder: a limited request neither resolves the share nor creates an order', async () => {
    checkRateLimit.mockResolvedValue(false)

    const result = await placeGiftOrder({
      shareToken: 'tok',
      selections: [{ productId: 'p1', variantId: null }],
      email: 'buyer@example.com',
      chargeCurrency: 'NGN',
      shippingToken: quoteFor(OWNER_AS_ADDRESS),
    })

    expect(result).toEqual({ ok: false, error: 'Too many attempts. Please wait a moment and try again.' })
    expect(resolveShare).not.toHaveBeenCalled()
    expect(order.create).not.toHaveBeenCalled()
  })
})

describe('an unknown or disabled share token', () => {
  it('getGiftShippingRates returns no options', async () => {
    resolveShare.mockResolvedValue(null)

    const options = await getGiftShippingRates({
      shareToken: 'nope',
      selections: [{ productId: 'p1', variantId: null }],
      email: 'buyer@example.com',
      chargeCurrency: 'NGN',
    })

    expect(options).toEqual([])
    expect(getShippingRates).not.toHaveBeenCalled()
  })

  it('placeGiftOrder refuses without creating anything', async () => {
    resolveShare.mockResolvedValue(null)

    const result = await placeGiftOrder({
      shareToken: 'nope',
      selections: [{ productId: 'p1', variantId: null }],
      email: 'buyer@example.com',
      chargeCurrency: 'NGN',
      shippingToken: quoteFor(OWNER_AS_ADDRESS),
    })

    expect(result.ok).toBe(false)
    expect(order.create).not.toHaveBeenCalled()
  })
})

describe('THE SECURITY PROPERTY: the buyer never supplies the destination', () => {
  it('placeGiftOrder IGNORES an `address` key smuggled onto its input — the order ships to the OWNER', async () => {
    const result = await placeGiftOrder({
      shareToken: 'tok',
      selections: [{ productId: 'p1', variantId: null }],
      email: 'buyer@example.com',
      chargeCurrency: 'NGN',
      shippingToken: quoteFor(OWNER_AS_ADDRESS),
      // Every shape a tamperer might try, all at once.
      address: BUYER_ADDRESS,
      shipLine1: BUYER_ADDRESS.line1,
      shipCity: BUYER_ADDRESS.city,
      giftAddress: BUYER_ADDRESS,
      profileId: 'someone-else',
    })

    expect(result).toEqual({ ok: true, orderNumber: expect.stringMatching(/^MSE-\d{6}$/) })

    const data = order.create.mock.calls[0][0].data
    expect(data.shipFullName).toBe(OWNER_ADDRESS.fullName)
    expect(data.shipLine1).toBe(OWNER_ADDRESS.line1)
    expect(data.shipCity).toBe(OWNER_ADDRESS.city)
    expect(data.shipPostalCode).toBe(OWNER_ADDRESS.postalCode)
    expect(data.profileId).toBeNull()

    // Nothing the buyer sent appears anywhere on the row.
    const serialized = JSON.stringify(data)
    expect(serialized).not.toContain('Attacker Way')
    expect(serialized).not.toContain('Mallory')
    expect(serialized).not.toContain('someone-else')
  })

  it('getGiftShippingRates quotes against the OWNER address and the wishlist-filtered lines, ignoring any address on the input', async () => {
    await getGiftShippingRates({
      shareToken: 'tok',
      selections: [
        { productId: 'p1', variantId: null },
        { productId: 'NOT-ON-LIST', variantId: null },
      ],
      email: 'buyer@example.com',
      chargeCurrency: 'NGN',
      address: BUYER_ADDRESS,
    })

    expect(getShippingRates).toHaveBeenCalledTimes(1)
    const call = getShippingRates.mock.calls[0][0]
    expect(call.address).toEqual({
      fullName: OWNER_ADDRESS.fullName,
      phone: OWNER_ADDRESS.phone,
      line1: OWNER_ADDRESS.line1,
      line2: undefined,
      city: OWNER_ADDRESS.city,
      state: OWNER_ADDRESS.state,
      country: OWNER_ADDRESS.country,
      postalCode: OWNER_ADDRESS.postalCode,
    })
    // Off-list selections never reach the quote, and every line is quantity 1.
    expect(call.lines).toEqual([{ productId: 'p1', variantId: undefined, quantity: 1 }])
    // The buyer's OWN cart is irrelevant to a gift: the explicit override is
    // what makes `getShippingRates` skip its own cart resolution.
    expect(call.guestLines).toBeUndefined()
    // Every option this call returns must be a GIFT-scoped token — the whole
    // point of the scope field is that it can never be spent at ordinary
    // checkout.
    expect(call.scope).toBe('gift')
  })

  // Phase 10c fix: `getShippingRates` SUMS the quantities of the lines it is
  // handed, and `createGiftOrder` collapses duplicate selections — so before
  // this fix a request repeating one productId 50 times (the schema's own cap)
  // was quoted as a 50-unit package while the resulting order carried a single
  // qty-1 line. The buyer paid the inflated shipping for a package that never
  // existed. Quote and order must describe the same contents by construction.
  it('collapses duplicate selections before quoting — 50 copies of one product quote a ONE-unit package', async () => {
    const fifty = Array.from({ length: 50 }, () => ({ productId: 'p1', variantId: null }))

    await getGiftShippingRates({
      shareToken: 'tok',
      selections: fifty,
      email: 'buyer@example.com',
      chargeCurrency: 'NGN',
    })

    expect(getShippingRates.mock.calls[0][0].lines).toEqual([{ productId: 'p1', variantId: undefined, quantity: 1 }])
  })

  it('dedupes per (productId, variantId) — distinct variants of one product stay distinct lines', async () => {
    await getGiftShippingRates({
      shareToken: 'tok',
      selections: [
        { productId: 'p1', variantId: 'v1' },
        { productId: 'p1', variantId: 'v1' },
        { productId: 'p1', variantId: 'v2' },
        { productId: 'p1', variantId: null },
        { productId: 'p2', variantId: null },
      ],
      email: 'buyer@example.com',
      chargeCurrency: 'NGN',
    })

    expect(getShippingRates.mock.calls[0][0].lines).toEqual([
      { productId: 'p1', variantId: 'v1', quantity: 1 },
      { productId: 'p1', variantId: 'v2', quantity: 1 },
      { productId: 'p1', variantId: undefined, quantity: 1 },
      { productId: 'p2', variantId: undefined, quantity: 1 },
    ])
  })

  it('getGiftShippingRates returns no options when nothing selected is on the list', async () => {
    const options = await getGiftShippingRates({
      shareToken: 'tok',
      selections: [{ productId: 'NOT-ON-LIST', variantId: null }],
      email: 'buyer@example.com',
      chargeCurrency: 'NGN',
    })

    expect(options).toEqual([])
    expect(getShippingRates).not.toHaveBeenCalled()
  })
})

describe('the shipping quote is the integrity check', () => {
  it('refuses a quote minted for ANY other destination — the buyer cannot spend their own quote on a gift', async () => {
    const result = await placeGiftOrder({
      shareToken: 'tok',
      selections: [{ productId: 'p1', variantId: null }],
      email: 'buyer@example.com',
      chargeCurrency: 'NGN',
      shippingToken: quoteFor(BUYER_ADDRESS), // genuine signature, wrong address
    })

    expect(result.ok).toBe(false)
    expect(order.create).not.toHaveBeenCalled()
  })

  // Symmetric to `placeOrder`'s gift-scope rejection (`checkout/data.test.ts`):
  // a token minted by the ORDINARY checkout flow — same owner address, real
  // signature, unexpired — must not be spendable here just because it
  // happens to verify against the same address. Only `scope` distinguishes
  // it from a genuine gift token.
  it('refuses a checkout-scoped token, even when it verifies against the owner address', async () => {
    const result = await placeGiftOrder({
      shareToken: 'tok',
      selections: [{ productId: 'p1', variantId: null }],
      email: 'buyer@example.com',
      chargeCurrency: 'NGN',
      shippingToken: quoteFor(OWNER_AS_ADDRESS, 'NGN', 250_000, 'checkout'),
    })

    expect(result.ok).toBe(false)
    expect(order.create).not.toHaveBeenCalled()
  })

  it('refuses a tampered token', async () => {
    const token = quoteFor(OWNER_AS_ADDRESS)
    const [body, sig] = token.split('.')
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
    const tampered = `${Buffer.from(JSON.stringify({ ...payload, amountMinor: 1 })).toString('base64url')}.${sig}`

    const result = await placeGiftOrder({
      shareToken: 'tok',
      selections: [{ productId: 'p1', variantId: null }],
      email: 'buyer@example.com',
      chargeCurrency: 'NGN',
      shippingToken: tampered,
    })

    expect(result.ok).toBe(false)
    expect(order.create).not.toHaveBeenCalled()
  })

  it('refuses an expired token', async () => {
    const expiredSalt = 'fixed-test-salt'
    const expired = signQuote({
      label: 'Standard',
      amountMinor: 250_000,
      currency: 'NGN',
      addressHash: addressHash(OWNER_AS_ADDRESS, expiredSalt),
      salt: expiredSalt,
      exp: Date.now() - 1,
      scope: 'gift',
    })

    const result = await placeGiftOrder({
      shareToken: 'tok',
      selections: [{ productId: 'p1', variantId: null }],
      email: 'buyer@example.com',
      chargeCurrency: 'NGN',
      shippingToken: expired,
    })

    expect(result.ok).toBe(false)
    expect(order.create).not.toHaveBeenCalled()
  })

  it('refuses a currency mismatch between the quote and the charge currency', async () => {
    const result = await placeGiftOrder({
      shareToken: 'tok',
      selections: [{ productId: 'p1', variantId: null }],
      email: 'buyer@example.com',
      chargeCurrency: 'NGN',
      shippingToken: quoteFor(OWNER_AS_ADDRESS, 'USD', 2_500), // USD quote, NGN charge
    })

    expect(result.ok).toBe(false)
    expect(order.create).not.toHaveBeenCalled()
  })

  it('never throws out when the quote secret is missing — it degrades to a generic error', async () => {
    const token = quoteFor(OWNER_AS_ADDRESS)
    delete process.env.SHIPBUBBLE_QUOTE_SECRET

    const result = await placeGiftOrder({
      shareToken: 'tok',
      selections: [{ productId: 'p1', variantId: null }],
      email: 'buyer@example.com',
      chargeCurrency: 'NGN',
      shippingToken: token,
    })

    expect(result).toEqual({ ok: false, error: 'Something went wrong. Please try again.' })
    expect(order.create).not.toHaveBeenCalled()
  })

  it('writes the verified quote amount and label onto the order, never a buyer-supplied number', async () => {
    await placeGiftOrder({
      shareToken: 'tok',
      selections: [{ productId: 'p1', variantId: null }],
      email: 'buyer@example.com',
      chargeCurrency: 'NGN',
      shippingToken: quoteFor(OWNER_AS_ADDRESS),
      shippingMinor: 1,
      totalMinor: 1,
    })

    const data = order.create.mock.calls[0][0].data
    expect(data.shippingMinor).toBe(250_000)
    expect(data.shippingLabel).toBe('Standard')
    expect(data.subtotalMinor).toBe(100_000)
    expect(data.totalMinor).toBe(357_500)
  })
})

describe('malformed input', () => {
  it.each([
    ['a missing token', { selections: [{ productId: 'p1', variantId: null }], email: 'b@e.com', chargeCurrency: 'NGN', shippingToken: 't' }],
    ['no selections', { shareToken: 'tok', selections: [], email: 'b@e.com', chargeCurrency: 'NGN', shippingToken: 't' }],
    ['a bad email', { shareToken: 'tok', selections: [{ productId: 'p1', variantId: null }], email: 'nope', chargeCurrency: 'NGN', shippingToken: 't' }],
    ['an unknown currency', { shareToken: 'tok', selections: [{ productId: 'p1', variantId: null }], email: 'b@e.com', chargeCurrency: 'GBP', shippingToken: 't' }],
    ['a missing shipping token', { shareToken: 'tok', selections: [{ productId: 'p1', variantId: null }], email: 'b@e.com', chargeCurrency: 'NGN' }],
    ['nothing at all', undefined],
  ])('placeGiftOrder refuses %s without creating an order', async (_label, input) => {
    const result = await placeGiftOrder(input)
    expect(result.ok).toBe(false)
    expect(order.create).not.toHaveBeenCalled()
  })

  it('getGiftShippingRates returns no options for malformed input', async () => {
    await expect(getGiftShippingRates(undefined)).resolves.toEqual([])
    await expect(getGiftShippingRates({ shareToken: 'tok' })).resolves.toEqual([])
    expect(getShippingRates).not.toHaveBeenCalled()
  })

  it('caps the number of selections a single request may carry', async () => {
    const many = Array.from({ length: 51 }, (_, i) => ({ productId: `p${i}`, variantId: null }))

    const result = await placeGiftOrder({
      shareToken: 'tok',
      selections: many,
      email: 'b@e.com',
      chargeCurrency: 'NGN',
      shippingToken: quoteFor(OWNER_AS_ADDRESS),
    })

    expect(result.ok).toBe(false)
    expect(order.create).not.toHaveBeenCalled()
  })
})
