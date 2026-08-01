import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { signQuote, addressHash, shareRefFor } from '@/features/checkout/lib/shipping-quote'
import { FLAT_INTERNATIONAL_USD } from '@/features/checkout/lib/shipping-config'
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

// `headers` is here for the end-to-end test at the bottom, which runs the REAL
// `buildShippingRates` — that reads the geo signal through `serverChargeCurrency`.
const cookieStore = vi.hoisted(() => ({ set: vi.fn(), get: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: vi.fn(async () => cookieStore), headers: vi.fn(async () => new Headers()) }))

const resolveShare = vi.hoisted(() => vi.fn())
vi.mock('@/features/gifting/share', () => ({ resolveShare: (...args: [string]) => resolveShare(...args) }))

const checkRateLimit = vi.hoisted(() => vi.fn())
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: (...args: unknown[]) => checkRateLimit(...args),
  RATE_LIMITED_MESSAGE: 'Too many attempts. Please wait a moment and try again.',
}))

// The gift flow calls the NON-ACTION rate builder directly (never the public
// `getShippingRates` Server Action) — that is what keeps the quote's `scope`
// off the wire, so this is the module the test must double.
const buildShippingRates = vi.hoisted(() => vi.fn())
vi.mock('@/features/checkout/lib/shipping-rates', () => ({
  buildShippingRates: (...args: [unknown, unknown]) => buildShippingRates(...args),
}))

/**
 * The REAL rate builder, for the end-to-end test at the bottom: the double
 * above proves what `getGiftShippingRates` ASKS for, but only the real thing
 * mints a token `placeGiftOrder` will actually accept, which is the only way
 * to prove the new share binding hasn't broken legitimate purchases.
 */
const { buildShippingRates: realBuildShippingRates } = await vi.importActual<
  typeof import('@/features/checkout/lib/shipping-rates')
>('@/features/checkout/lib/shipping-rates')

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

/** The share token every test below spends against — `resolveShare` is doubled, so any string resolves to `SHARE`. */
const SHARE_TOKEN = 'tok'

/**
 * Mints a genuine quote token. Defaults to what a legitimate gift quote for
 * `SHARE_TOKEN` looks like — gift-scoped AND bound to that share's `shareRef`
 * — so every pre-existing test keeps exercising the path it was written for.
 * `shareToken` is overridable to build the "right address, WRONG share" token
 * the oracle test needs; pass `null` for a token carrying no `shareRef` at all
 * (NOT `undefined`, which would just select the default above).
 */
function quoteFor(
  address: Address,
  currency: 'NGN' | 'USD' = 'NGN',
  amountMinor = 250_000,
  scope: 'checkout' | 'gift' = 'gift',
  shareToken: string | null = SHARE_TOKEN,
): string {
  const salt = 'fixed-test-salt'
  return signQuote({
    label: 'Standard',
    amountMinor,
    currency,
    addressHash: addressHash(address, salt),
    salt,
    exp: Date.now() + 60_000,
    scope,
    shareRef: shareToken === null ? undefined : shareRefFor(shareToken),
  })
}

beforeEach(() => {
  process.env.SHIPBUBBLE_QUOTE_SECRET = 'test-secret'
  vi.clearAllMocks()
  checkRateLimit.mockResolvedValue(true)
  resolveShare.mockResolvedValue(SHARE)
  resolveProductsByIds.mockResolvedValue([P1])
  buildShippingRates.mockResolvedValue([])
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
    expect(buildShippingRates).not.toHaveBeenCalled()
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
    expect(buildShippingRates).not.toHaveBeenCalled()
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

    expect(buildShippingRates).toHaveBeenCalledTimes(1)
    const call = buildShippingRates.mock.calls[0][0]
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
    // what makes the rate builder skip its own cart resolution.
    expect(call.guestLines).toBeUndefined()

    // The stamp is the SECOND argument — never a field of the wire input, so
    // no HTTP caller can set it. Every option this call returns is therefore a
    // GIFT-scoped token bound to THIS share: it can neither be spent at
    // ordinary checkout nor tested against any other share.
    expect(buildShippingRates.mock.calls[0][1]).toEqual({ scope: 'gift', shareRef: shareRefFor('tok') })
    // Belt and braces: the raw share token must never travel inside the quote
    // payload the buyer's browser can read — only the unforgeable HMAC of it.
    expect(buildShippingRates.mock.calls[0][1].shareRef).not.toContain('tok')
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

    expect(buildShippingRates.mock.calls[0][0].lines).toEqual([{ productId: 'p1', variantId: undefined, quantity: 1 }])
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

    expect(buildShippingRates.mock.calls[0][0].lines).toEqual([
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
    expect(buildShippingRates).not.toHaveBeenCalled()
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

describe('THE ADDRESS ORACLE: no combination of token and inputs yields two distinguishable outcomes', () => {
  /**
   * The baseline every rejection below must be INDISTINGUISHABLE from — an
   * ordinary expired quote, the most boring failure this action has.
   */
  async function expiredResult() {
    const salt = 'fixed-test-salt'
    const expired = signQuote({
      label: 'Standard',
      amountMinor: 250_000,
      currency: 'NGN',
      addressHash: addressHash(OWNER_AS_ADDRESS, salt),
      salt,
      exp: Date.now() - 1,
      scope: 'gift',
      shareRef: shareRefFor(SHARE_TOKEN),
    })

    return placeGiftOrder({
      shareToken: SHARE_TOKEN,
      selections: [{ productId: 'p1', variantId: null }],
      email: 'buyer@example.com',
      chargeCurrency: 'NGN',
      shippingToken: expired,
    })
  }

  // THE ATTACK this closes: `scope: 'gift'` alone was not enough, because
  // minting a gift-scoped token for an address you control is a LEGITIMATE
  // operation — `enableShare` pins any address the caller owns. So an attacker
  // saves a GUESSED street as their own address, shares their own wishlist,
  // takes a real gift quote against it, and presents that token here against
  // the VICTIM's share. Before the share binding: a wrong guess failed
  // `verifyQuote` (quote expired) and a right guess sailed past it, and the
  // difference recovered the recipient's hidden line1/postalCode. The token
  // below is that attack in its strongest form — genuinely signed, genuinely
  // gift-scoped, unexpired, and bound to the CORRECT (victim) address, so
  // `shareRef` is the ONLY thing wrong with it.
  it('refuses a gift token minted for a DIFFERENT share, with EXACTLY the expired-token result', async () => {
    const result = await placeGiftOrder({
      shareToken: SHARE_TOKEN,
      selections: [{ productId: 'p1', variantId: null }],
      email: 'buyer@example.com',
      chargeCurrency: 'NGN',
      shippingToken: quoteFor(OWNER_AS_ADDRESS, 'NGN', 250_000, 'gift', 'some-other-share-token'),
    })

    expect(result).toEqual(await expiredResult())
    expect(order.create).not.toHaveBeenCalled()
  })

  it('refuses a gift token carrying no shareRef at all', async () => {
    const result = await placeGiftOrder({
      shareToken: SHARE_TOKEN,
      selections: [{ productId: 'p1', variantId: null }],
      email: 'buyer@example.com',
      chargeCurrency: 'NGN',
      shippingToken: quoteFor(OWNER_AS_ADDRESS, 'NGN', 250_000, 'gift', null),
    })

    expect(result).toEqual(await expiredResult())
    expect(order.create).not.toHaveBeenCalled()
  })

  // The last distinguishable pair: an attacker holding any gift token could
  // deliberately send the WRONG chargeCurrency, and then a wrong guess
  // returned "quote expired" while a right guess returned "something went
  // wrong" — two strings, no order written either way, i.e. the oracle again
  // one level up. Both now speak with one voice.
  it('returns EXACTLY the expired-quote result for a currency mismatch', async () => {
    const result = await placeGiftOrder({
      shareToken: SHARE_TOKEN,
      selections: [{ productId: 'p1', variantId: null }],
      email: 'buyer@example.com',
      chargeCurrency: 'NGN',
      shippingToken: quoteFor(OWNER_AS_ADDRESS, 'USD', 2_500),
    })

    expect(result).toEqual(await expiredResult())
    expect(order.create).not.toHaveBeenCalled()
  })

  // The sweep: every rejection reachable once a share has resolved and a
  // signature has been checked must be the SAME object. If a future change
  // gives any of them its own message, this fails.
  it('every post-verification rejection is the same result — wrong address, wrong scope, wrong share, wrong currency', async () => {
    const baseline = await expiredResult()

    const tokens = [
      quoteFor(BUYER_ADDRESS), // right share, WRONG address
      quoteFor(OWNER_AS_ADDRESS, 'NGN', 250_000, 'checkout'), // WRONG scope
      quoteFor(OWNER_AS_ADDRESS, 'NGN', 250_000, 'gift', 'another-share'), // WRONG share
      quoteFor(OWNER_AS_ADDRESS, 'USD', 2_500), // WRONG currency
    ]

    for (const shippingToken of tokens) {
      const result = await placeGiftOrder({
        shareToken: SHARE_TOKEN,
        selections: [{ productId: 'p1', variantId: null }],
        email: 'buyer@example.com',
        chargeCurrency: 'NGN',
        shippingToken,
      })

      expect(result).toEqual(baseline)
    }

    expect(order.create).not.toHaveBeenCalled()
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
    expect(buildShippingRates).not.toHaveBeenCalled()
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

describe('the happy path still works end to end', () => {
  /**
   * The REAL rate builder, so the token `placeGiftOrder` receives is one
   * `getGiftShippingRates` actually minted — signature, scope AND shareRef
   * included. Every guard added to close the oracle rejects a token that is
   * wrong in some way; this is the test that says a RIGHT one still buys
   * something, which is the only thing standing between a hardened flow and a
   * broken one.
   *
   * USD is used deliberately: it takes the flat-international branch, so no
   * ShipBubble client, no cart lookup and no catalog read are needed to reach
   * a signed option — the token, not the courier, is what's under test.
   */
  it('getGiftShippingRates → placeGiftOrder creates the order', async () => {
    buildShippingRates.mockImplementation(realBuildShippingRates)

    const request = {
      shareToken: SHARE_TOKEN,
      selections: [{ productId: 'p1', variantId: null }],
      email: 'buyer@example.com',
      chargeCurrency: 'USD' as const,
    }

    const options = await getGiftShippingRates(request)

    expect(options).toHaveLength(1)
    expect(options[0]).toMatchObject({ id: 'international', currency: 'USD', amountMinor: FLAT_INTERNATIONAL_USD.amountMinor })

    const result = await placeGiftOrder({ ...request, shippingToken: options[0].token })

    expect(result).toEqual({ ok: true, orderNumber: expect.stringMatching(/^MSE-\d{6}$/) })

    // The order ships to the OWNER and carries the SERVER-signed shipping
    // amount, exactly as before the hardening.
    const data = order.create.mock.calls[0][0].data
    expect(data.shipLine1).toBe(OWNER_ADDRESS.line1)
    expect(data.currency).toBe('USD')
    expect(data.shippingMinor).toBe(FLAT_INTERNATIONAL_USD.amountMinor)
    expect(data.shippingLabel).toBe(FLAT_INTERNATIONAL_USD.label)
  })

  it('...but that very token is inert at any OTHER share', async () => {
    buildShippingRates.mockImplementation(realBuildShippingRates)

    const options = await getGiftShippingRates({
      shareToken: SHARE_TOKEN,
      selections: [{ productId: 'p1', variantId: null }],
      email: 'buyer@example.com',
      chargeCurrency: 'USD',
    })

    // `resolveShare` is doubled to resolve ANY token to the same SHARE, so the
    // owner address still matches and `verifyQuote` still passes — the only
    // thing that differs is which share token is being spent against, which is
    // precisely the binding under test.
    const result = await placeGiftOrder({
      shareToken: 'a-different-share-token',
      selections: [{ productId: 'p1', variantId: null }],
      email: 'buyer@example.com',
      chargeCurrency: 'USD',
      shippingToken: options[0].token,
    })

    expect(result).toEqual({ ok: false, error: 'Shipping quote expired. Please try again.' })
    expect(order.create).not.toHaveBeenCalled()
  })
})
