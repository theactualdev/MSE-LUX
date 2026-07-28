import { describe, it, expect, vi, beforeEach } from 'vitest'
import { signQuote, addressHash } from '@/features/checkout/lib/shipping-quote'
import { MAX_ADDRESSES_PER_PROFILE } from '@/features/account/data'
import type { Product } from '@/types/catalog'
import type { Contact, Address } from '@/features/checkout/schema'

/**
 * `buildCartLines`, `mapOrderRow`, and the real `shipping-quote` lib
 * (`signQuote`/`addressHash`/`verifyQuote`, exercised via `placeOrder`
 * itself) are pure and DB-free, so they run for real here (not mocked) —
 * these tests assert on their actual output, which is exactly the point: the
 * stored `unitPriceMinor` must come from the authored catalog via
 * `buildCartLines`, and the stored `shippingMinor`/`shippingLabel` must come
 * from a verified quote token, never from anything the caller supplied.
 *
 * Same rationale as `cart/data.test.ts`: Prisma bypasses RLS, so
 * authorization lives entirely in this module's query scoping — assertions
 * below check the *arguments* Prisma is called with, not just return values.
 */

const cartItem = {
  findMany: vi.fn(),
  deleteMany: vi.fn(),
}

const order = {
  create: vi.fn(),
}

const product = {
  update: vi.fn(),
}

const productVariant = {
  update: vi.fn(),
}

// Address save-back reads/writes go straight through top-level `db`, never
// through `tx` — the save-back runs strictly AFTER `$transaction` above has
// already resolved (see `data.ts`'s call site comment).
const address = {
  findMany: vi.fn(),
  create: vi.fn(),
}

// The transaction callback receives the same spies as top-level `db` — see
// `cart/data.test.ts` for why assertions don't need to care whether a call
// happened inside or outside `$transaction`.
const tx = { cartItem, order, product, productVariant }

const $transaction = vi.fn(async (fn: (client: typeof tx) => unknown) => fn(tx))

vi.mock('@/lib/db', () => ({
  db: {
    get cartItem() {
      return cartItem
    },
    get order() {
      return order
    },
    get product() {
      return product
    },
    get productVariant() {
      return productVariant
    },
    get address() {
      return address
    },
    $transaction: (...args: [(client: typeof tx) => unknown]) => $transaction(...args),
  },
}))

const getCurrentUserId = vi.fn()

vi.mock('@/features/auth/claims', () => ({
  getCurrentUserId: () => getCurrentUserId(),
}))

// placeOrder sets an httpOnly cookie binding a GUEST order to the session,
// and `serverChargeCurrency` (Phase 9c) reads the geo header through the
// same `next/headers` module — both are mocked here, per the project's
// `next/headers` mocking idiom (`src/lib/rate-limit.test.ts`).
const cookieStore = { set: vi.fn(), get: vi.fn() }
const headersMock = vi.fn()
vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => cookieStore),
  headers: (...args: unknown[]) => headersMock(...args),
}))

function headerStore(entries: Record<string, string> = {}) {
  const h = new Headers()
  for (const [key, value] of Object.entries(entries)) h.set(key, value)
  return h
}

const resolveProductsByIds = vi.fn()

vi.mock('@/features/catalog/server/resolve-products', () => ({
  resolveProductsByIds: (...args: [string[]]) => resolveProductsByIds(...args),
}))

const checkRateLimit = vi.fn()
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: (...args: unknown[]) => checkRateLimit(...args),
  RATE_LIMITS: { payment: { limit: 10, windowSeconds: 60 }, checkout: { limit: 20, windowSeconds: 60 }, shippingQuote: { limit: 60, windowSeconds: 60 }, search: { limit: 120, windowSeconds: 60 }, auth: { limit: 40, windowSeconds: 300 }, authIdentity: { limit: 5, windowSeconds: 300 }, verify: { limit: 60, windowSeconds: 60 } },
  RATE_LIMITED_MESSAGE: 'Too many attempts. Please wait a moment and try again.',
}))

const { placeOrder } = await import('@/features/checkout/data')
const { RATE_LIMITED_MESSAGE } = await import('@/lib/rate-limit')

const USER_ID = '11111111-1111-4111-8111-111111111111'
const PRODUCT_ID = 'prod-1'
const VARIANT_ID = 'variant-1'

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
  optionTypes: [{ name: 'Size', values: ['18cm', '20cm'] }],
  variants: [
    {
      id: VARIANT_ID,
      sku: 'SKU-1-V1',
      options: [{ name: 'Size', value: '18cm' }],
      inventory: 3,
    },
  ],
  badges: [],
  status: 'active',
  seo: {},
}

const CONTACT: Contact = { email: 'jane@example.com' }
const ADDRESS: Address = {
  fullName: 'Jane Doe',
  phone: '+234 800 000 0000',
  line1: '1 Victoria Island',
  city: 'Lagos',
  state: 'Lagos',
  country: 'Nigeria',
}

const SHIPPING_QUOTE_SECRET = 'test-shipping-quote-secret'

/**
 * Signs a real, verifiable shipping-quote token for `ADDRESS` using the
 * actual `shipping-quote` lib (not mocked) — `placeOrder` calls the real
 * `verifyQuote`, so a fixture must be an authentic token, not a stub value.
 * Defaults to the 'Lagos delivery' rate every existing assertion below was
 * written against; pass overrides to build a tampered/expired/wrong-address
 * token for the negative-path tests.
 */
function validShippingToken(overrides: { amountMinor?: number; currency?: 'NGN' | 'USD'; label?: string; exp?: number; address?: Address } = {}) {
  return signQuote({
    label: overrides.label ?? 'Lagos delivery',
    amountMinor: overrides.amountMinor ?? 250_000,
    currency: overrides.currency ?? 'NGN',
    addressHash: addressHash(overrides.address ?? ADDRESS),
    exp: overrides.exp ?? Date.now() + 60_000,
  })
}

// Subtotal for 1x PRODUCT_ID (no variant) in NGN = 500_000. Shipping (signed
// quote token for ADDRESS, NGN) = 250_000.
// Tax = round(500_000 * 0.075) = 37_500. Total = 787_500.
function createdRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    orderNumber: 'MSE-123456',
    email: CONTACT.email,
    status: 'PENDING',
    placedAt: new Date('2026-07-24T00:00:00Z'),
    shipFullName: ADDRESS.fullName,
    shipPhone: ADDRESS.phone,
    shipLine1: ADDRESS.line1,
    shipLine2: null,
    shipCity: ADDRESS.city,
    shipState: ADDRESS.state,
    shipCountry: ADDRESS.country,
    shipPostalCode: null,
    shippingLabel: 'Lagos delivery',
    currency: 'NGN',
    subtotalMinor: 500_000,
    shippingMinor: 250_000,
    taxMinor: 37_500,
    totalMinor: 787_500,
    lines: [
      {
        productName: PRODUCT.name,
        variantLabel: null,
        image: PRODUCT.images[0].src,
        imageAlt: PRODUCT.images[0].alt,
        quantity: 1,
        unitPriceMinor: 500_000,
        lineTotalMinor: 500_000,
      },
    ],
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.SHIPBUBBLE_QUOTE_SECRET = SHIPPING_QUOTE_SECRET
  getCurrentUserId.mockResolvedValue(null)
  resolveProductsByIds.mockResolvedValue([PRODUCT])
  order.create.mockResolvedValue(createdRow())
  address.findMany.mockResolvedValue([])
  address.create.mockResolvedValue({})
  // Default the limiter to "allow" so every pre-existing test below keeps
  // exercising real behaviour untouched; the rate-limit describe block below
  // overrides this per-test.
  checkRateLimit.mockResolvedValue(true)
  // Default to NO geo header (`serverChargeCurrency` resolves `null`), so
  // every pre-existing test below keeps exercising today's format-validated
  // client `chargeCurrency` unchanged; the currency-divergence describe
  // block below overrides this per-test.
  headersMock.mockResolvedValue(headerStore())
})

describe('placeOrder — guest checkout', () => {
  it('writes an order priced off the authored catalog, never a client value', async () => {
    const result = await placeOrder({
      contact: CONTACT,
      address: ADDRESS,
      shippingToken: validShippingToken(),
      chargeCurrency: 'NGN',
      guestLines: [{ productId: PRODUCT_ID, quantity: 1 }],
    })

    expect(result).toEqual({
      ok: true,
      order: expect.objectContaining({ orderNumber: 'MSE-123456' }),
    })

    expect(order.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        profileId: null,
        email: CONTACT.email,
        status: 'PENDING',
        shipFullName: ADDRESS.fullName,
        shipPhone: ADDRESS.phone,
        shipLine1: ADDRESS.line1,
        shipLine2: null,
        shipCity: ADDRESS.city,
        shipState: ADDRESS.state,
        shipCountry: ADDRESS.country,
        shipPostalCode: null,
        shippingLabel: 'Lagos delivery',
        currency: 'NGN',
        subtotalMinor: 500_000,
        shippingMinor: 250_000,
        taxMinor: 37_500,
        totalMinor: 787_500,
        orderNumber: expect.stringMatching(/^MSE-\d{6}$/),
        lines: {
          create: [
            expect.objectContaining({
              productId: PRODUCT_ID,
              variantId: null,
              quantity: 1,
              // This is the authored NGN price from PRODUCT.priceSet — there is
              // no client-supplied price anywhere in PlaceOrderInput to smuggle
              // a different value through.
              unitPriceMinor: 500_000,
              lineTotalMinor: 500_000,
            }),
          ],
        },
      }),
      include: { lines: true },
    })

    // Placement creates a PENDING order only — inventory decrement and cart
    // clear are fulfilment side effects that now live in `markOrderPaid`
    // (`lib/fulfil-order.ts`), triggered only by a verified payment.
    expect(product.update).not.toHaveBeenCalled()
    expect(productVariant.update).not.toHaveBeenCalled()
    expect(cartItem.deleteMany).not.toHaveBeenCalled()
  })

  it('clamps a requested quantity above inventory in the stored line', async () => {
    await placeOrder({
      contact: CONTACT,
      address: ADDRESS,
      shippingToken: validShippingToken(),
      chargeCurrency: 'NGN',
      // PRODUCT.inventory is 5; requesting 99 should clamp to 5.
      guestLines: [{ productId: PRODUCT_ID, quantity: 99 }],
    })

    expect(order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          lines: {
            create: [
              expect.objectContaining({
                quantity: 5,
                unitPriceMinor: 500_000,
                lineTotalMinor: 2_500_000,
              }),
            ],
          },
        }),
      }),
    )
  })

  it('aggregates duplicate guest tuples for the same product before clamping, so it cannot oversell', async () => {
    // PRODUCT.inventory is 5. Two tuples for the same product at 99 each must
    // clamp ONCE to 5 — not twice, which would store an order line for 10
    // against 5 in stock (and, later, oversell on fulfilment).
    await placeOrder({
      contact: CONTACT,
      address: ADDRESS,
      shippingToken: validShippingToken(),
      chargeCurrency: 'NGN',
      guestLines: [
        { productId: PRODUCT_ID, quantity: 99 },
        { productId: PRODUCT_ID, quantity: 99 },
      ],
    })

    expect(order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          lines: {
            create: [expect.objectContaining({ productId: PRODUCT_ID, quantity: 5, lineTotalMinor: 2_500_000 })],
          },
        }),
      }),
    )
  })

  it('rejects an invalid chargeCurrency without writing an order', async () => {
    await expect(
      placeOrder({
        contact: CONTACT,
        address: ADDRESS,
        shippingToken: validShippingToken(),
        chargeCurrency: 'EUR' as never,
        guestLines: [{ productId: PRODUCT_ID, quantity: 1 }],
      }),
    ).resolves.toEqual({ error: expect.any(String) })

    expect(order.create).not.toHaveBeenCalled()
    expect($transaction).not.toHaveBeenCalled()
  })

  it('returns an error and writes nothing when the cart is empty', async () => {
    await expect(
      placeOrder({
        contact: CONTACT,
        address: ADDRESS,
        shippingToken: validShippingToken(),
        chargeCurrency: 'NGN',
        guestLines: [],
      }),
    ).resolves.toEqual({ error: expect.any(String) })

    expect(order.create).not.toHaveBeenCalled()
    expect($transaction).not.toHaveBeenCalled()
  })

  it('returns an error and writes nothing when every line is out of stock', async () => {
    resolveProductsByIds.mockResolvedValue([{ ...PRODUCT, inventory: 0, variants: [] }])

    await expect(
      placeOrder({
        contact: CONTACT,
        address: ADDRESS,
        shippingToken: validShippingToken(),
        chargeCurrency: 'NGN',
        guestLines: [{ productId: PRODUCT_ID, quantity: 1 }],
      }),
    ).resolves.toEqual({ error: expect.any(String) })

    expect(order.create).not.toHaveBeenCalled()
    expect($transaction).not.toHaveBeenCalled()
  })

  it('rejects a malformed shipping token without writing an order', async () => {
    await expect(
      placeOrder({
        contact: CONTACT,
        address: ADDRESS,
        shippingToken: 'not-a-real-token',
        chargeCurrency: 'NGN',
        guestLines: [{ productId: PRODUCT_ID, quantity: 1 }],
      }),
    ).resolves.toEqual({ error: expect.any(String) })

    expect(order.create).not.toHaveBeenCalled()
    expect($transaction).not.toHaveBeenCalled()
  })

  // Minor fix (Phase 9c final fixes): `verifyQuote` internally does
  // `token.split('.')`, which throws a raw TypeError on a nullish token
  // rather than returning `null` — `placeOrder` is a public Server Action
  // whose args aren't runtime-validated, so a caller can omit `shippingToken`
  // entirely. This must resolve a controlled typed error, never throw out of
  // `placeOrder`.
  it('rejects a nullish shipping token (never throws out) without writing an order', async () => {
    await expect(
      placeOrder({
        contact: CONTACT,
        address: ADDRESS,
        shippingToken: undefined as unknown as string,
        chargeCurrency: 'NGN',
        guestLines: [{ productId: PRODUCT_ID, quantity: 1 }],
      }),
    ).resolves.toEqual({ error: expect.any(String) })

    expect(order.create).not.toHaveBeenCalled()
    expect($transaction).not.toHaveBeenCalled()
  })

  // Same fix: `verifyQuote` -> `requireSecret()` throws (deliberately, per
  // its own doc comment) when `SHIPBUBBLE_QUOTE_SECRET` is unset — a server
  // misconfiguration, not a bad token, but still must not escape `placeOrder`
  // as a raw throw.
  it('never throws out when SHIPBUBBLE_QUOTE_SECRET is unset — resolves a controlled error instead', async () => {
    delete process.env.SHIPBUBBLE_QUOTE_SECRET
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(
      placeOrder({
        contact: CONTACT,
        address: ADDRESS,
        shippingToken: 'some-token.some-sig',
        chargeCurrency: 'NGN',
        guestLines: [{ productId: PRODUCT_ID, quantity: 1 }],
      }),
    ).resolves.toEqual({ error: expect.any(String) })

    expect(order.create).not.toHaveBeenCalled()
    expect($transaction).not.toHaveBeenCalled()
    expect(errorSpy).toHaveBeenCalled()

    errorSpy.mockRestore()
  })

  it('rejects a tampered shipping token (payload edited without re-signing) without writing an order', async () => {
    const token = validShippingToken()
    const [body, sig] = token.split('.')
    const tamperedPayload = { label: 'Lagos delivery', amountMinor: 1, currency: 'NGN', addressHash: addressHash(ADDRESS), exp: Date.now() + 60_000 }
    const tamperedBody = Buffer.from(JSON.stringify(tamperedPayload)).toString('base64url')
    const tamperedToken = `${tamperedBody}.${sig}`
    expect(tamperedBody).not.toBe(body) // sanity: the body really changed

    await expect(
      placeOrder({
        contact: CONTACT,
        address: ADDRESS,
        shippingToken: tamperedToken,
        chargeCurrency: 'NGN',
        guestLines: [{ productId: PRODUCT_ID, quantity: 1 }],
      }),
    ).resolves.toEqual({ error: expect.any(String) })

    expect(order.create).not.toHaveBeenCalled()
    expect($transaction).not.toHaveBeenCalled()
  })

  it('rejects an expired shipping token without writing an order', async () => {
    await expect(
      placeOrder({
        contact: CONTACT,
        address: ADDRESS,
        shippingToken: validShippingToken({ exp: Date.now() - 1000 }),
        chargeCurrency: 'NGN',
        guestLines: [{ productId: PRODUCT_ID, quantity: 1 }],
      }),
    ).resolves.toEqual({ error: expect.any(String) })

    expect(order.create).not.toHaveBeenCalled()
    expect($transaction).not.toHaveBeenCalled()
  })

  it('rejects a shipping token signed for a different address without writing an order', async () => {
    const otherAddress: Address = { ...ADDRESS, line1: '99 Different Street', city: 'Ibadan' }

    await expect(
      placeOrder({
        contact: CONTACT,
        address: ADDRESS,
        shippingToken: validShippingToken({ address: otherAddress }),
        chargeCurrency: 'NGN',
        guestLines: [{ productId: PRODUCT_ID, quantity: 1 }],
      }),
    ).resolves.toEqual({ error: expect.any(String) })

    expect(order.create).not.toHaveBeenCalled()
    expect($transaction).not.toHaveBeenCalled()
  })

  it('rejects a shipping token whose currency does not match chargeCurrency without writing an order', async () => {
    await expect(
      placeOrder({
        contact: CONTACT,
        address: ADDRESS,
        shippingToken: validShippingToken({ currency: 'USD', amountMinor: 3000 }),
        chargeCurrency: 'NGN',
        guestLines: [{ productId: PRODUCT_ID, quantity: 1 }],
      }),
    ).resolves.toEqual({ error: expect.any(String) })

    expect(order.create).not.toHaveBeenCalled()
    expect($transaction).not.toHaveBeenCalled()
  })

  it('runs the whole placement inside exactly one transaction', async () => {
    await placeOrder({
      contact: CONTACT,
      address: ADDRESS,
      shippingToken: validShippingToken(),
      chargeCurrency: 'NGN',
      guestLines: [{ productId: PRODUCT_ID, quantity: 1 }],
    })

    expect($transaction).toHaveBeenCalledTimes(1)
  })

  it('retries in a FRESH transaction (not the failed one) after an orderNumber collision', async () => {
    // Postgres aborts the whole transaction on any failed statement, so a
    // real orderNumber collision surfaces as the $transaction call itself
    // rejecting — never as a recoverable error from inside a still-open tx.
    // This is exactly what the retry loop must wrap the whole $transaction
    // call to handle.
    $transaction
      .mockImplementationOnce(async () => {
        throw { code: 'P2002' }
      })
      .mockImplementationOnce(async (fn: (client: typeof tx) => unknown) => fn(tx))

    const result = await placeOrder({
      contact: CONTACT,
      address: ADDRESS,
      shippingToken: validShippingToken(),
      chargeCurrency: 'NGN',
      guestLines: [{ productId: PRODUCT_ID, quantity: 1 }],
    })

    expect(result).toEqual({ ok: true, order: expect.objectContaining({ orderNumber: 'MSE-123456' }) })
    expect($transaction).toHaveBeenCalledTimes(2)
  })

  it('returns { ok, order } shaped by mapOrderRow', async () => {
    const result = await placeOrder({
      contact: CONTACT,
      address: ADDRESS,
      shippingToken: validShippingToken(),
      chargeCurrency: 'NGN',
      guestLines: [{ productId: PRODUCT_ID, quantity: 1 }],
    })

    if (!('ok' in result)) throw new Error('expected an ok result')
    expect(result.order.orderNumber).toBe('MSE-123456')
    expect(result.order.summary.total).toEqual({ amountMinor: 787_500, currency: 'NGN' })
  })
})

describe('placeOrder — signed-in checkout', () => {
  beforeEach(() => {
    getCurrentUserId.mockResolvedValue(USER_ID)
    cartItem.findMany.mockResolvedValue([{ productId: PRODUCT_ID, variantId: null, quantity: 1 }])
  })

  it('reads the persisted server cart scoped by profileId, ignoring guestLines', async () => {
    await placeOrder({
      contact: CONTACT,
      address: ADDRESS,
      shippingToken: validShippingToken(),
      chargeCurrency: 'NGN',
      // Should be entirely ignored — the signed-in user's server cart is authoritative.
      guestLines: [{ productId: 'some-other-product', quantity: 99 }],
    })

    expect(cartItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { cart: { profileId: USER_ID } } }),
    )
    expect(order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          profileId: USER_ID,
          lines: { create: [expect.objectContaining({ productId: PRODUCT_ID, quantity: 1 })] },
        }),
      }),
    )

    // Placement creates a PENDING order only — inventory decrement and cart
    // clear are fulfilment side effects that now live in `markOrderPaid`
    // (`lib/fulfil-order.ts`), triggered only by a verified payment. In
    // particular, the signed-in user's cart must still be intact after a
    // PENDING order is placed.
    expect(product.update).not.toHaveBeenCalled()
    expect(productVariant.update).not.toHaveBeenCalled()
    expect(cartItem.deleteMany).not.toHaveBeenCalled()
  })

  it('returns an error and writes nothing when the signed-in user has no cart rows', async () => {
    cartItem.findMany.mockResolvedValue([])

    await expect(
      placeOrder({ contact: CONTACT, address: ADDRESS, shippingToken: validShippingToken(), chargeCurrency: 'NGN' }),
    ).resolves.toEqual({ error: expect.any(String) })

    expect(order.create).not.toHaveBeenCalled()
    expect(cartItem.deleteMany).not.toHaveBeenCalled()
  })

  it('makes no address queries when saveAddress is absent', async () => {
    await placeOrder({
      contact: CONTACT,
      address: ADDRESS,
      shippingToken: validShippingToken(),
      chargeCurrency: 'NGN',
    })

    expect(address.findMany).not.toHaveBeenCalled()
    expect(address.create).not.toHaveBeenCalled()
  })
})

describe('placeOrder — address save-back (best-effort, never affects the order result)', () => {
  beforeEach(() => {
    getCurrentUserId.mockResolvedValue(USER_ID)
    cartItem.findMany.mockResolvedValue([{ productId: PRODUCT_ID, variantId: null, quantity: 1 }])
  })

  it('makes zero address queries for a guest even when saveAddress is true', async () => {
    getCurrentUserId.mockResolvedValue(null)

    const result = await placeOrder({
      contact: CONTACT,
      address: ADDRESS,
      shippingToken: validShippingToken(),
      chargeCurrency: 'NGN',
      guestLines: [{ productId: PRODUCT_ID, quantity: 1 }],
      saveAddress: true,
    })

    expect(result).toEqual({ ok: true, order: expect.objectContaining({ orderNumber: 'MSE-123456' }) })
    expect(address.findMany).not.toHaveBeenCalled()
    expect(address.create).not.toHaveBeenCalled()
  })

  it('saves the parsed address, called only after the order transaction has resolved, when signed in and saveAddress is true', async () => {
    const callOrder: string[] = []
    order.create.mockImplementation(async () => {
      callOrder.push('order.create')
      return createdRow()
    })
    address.create.mockImplementation(async () => {
      callOrder.push('address.create')
      return {}
    })

    const result = await placeOrder({
      contact: CONTACT,
      address: ADDRESS,
      shippingToken: validShippingToken(),
      chargeCurrency: 'NGN',
      saveAddress: true,
    })

    expect(result).toEqual({ ok: true, order: expect.objectContaining({ orderNumber: 'MSE-123456' }) })
    expect(address.create).toHaveBeenCalledWith({
      data: {
        profileId: USER_ID,
        fullName: ADDRESS.fullName,
        phone: ADDRESS.phone,
        line1: ADDRESS.line1,
        line2: null,
        city: ADDRESS.city,
        state: ADDRESS.state,
        country: ADDRESS.country,
        postalCode: null,
        isDefault: false,
      },
    })
    expect(callOrder).toEqual(['order.create', 'address.create'])
  })

  it('does not save, and does not affect the order result, when the profile is already at the address cap', async () => {
    address.findMany.mockResolvedValue(
      Array.from({ length: MAX_ADDRESSES_PER_PROFILE }, () => ({
        line1: 'Some other street',
        city: 'Abuja',
        state: 'FCT',
        country: 'Nigeria',
        postalCode: null,
      })),
    )

    const result = await placeOrder({
      contact: CONTACT,
      address: ADDRESS,
      shippingToken: validShippingToken(),
      chargeCurrency: 'NGN',
      saveAddress: true,
    })

    expect(result).toEqual({ ok: true, order: expect.objectContaining({ orderNumber: 'MSE-123456' }) })
    expect(address.create).not.toHaveBeenCalled()
  })

  it('does not save a duplicate address that differs from an existing one only by case/whitespace', async () => {
    address.findMany.mockResolvedValue([
      {
        line1: `  ${ADDRESS.line1.toUpperCase()}  `,
        city: ADDRESS.city.toUpperCase(),
        state: ADDRESS.state.toUpperCase(),
        country: ADDRESS.country.toUpperCase(),
        postalCode: null,
      },
    ])

    const result = await placeOrder({
      contact: CONTACT,
      address: ADDRESS,
      shippingToken: validShippingToken(),
      chargeCurrency: 'NGN',
      saveAddress: true,
    })

    expect(result).toEqual({ ok: true, order: expect.objectContaining({ orderNumber: 'MSE-123456' }) })
    expect(address.create).not.toHaveBeenCalled()
  })

  it('still returns the ok order result, logging instead of throwing, when address.create rejects', async () => {
    address.create.mockRejectedValue(new Error('boom'))
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await placeOrder({
      contact: CONTACT,
      address: ADDRESS,
      shippingToken: validShippingToken(),
      chargeCurrency: 'NGN',
      saveAddress: true,
    })

    expect(result).toEqual({ ok: true, order: expect.objectContaining({ orderNumber: 'MSE-123456' }) })
    expect(consoleErrorSpy).toHaveBeenCalledWith('[placeOrder] address save-back failed', expect.any(Error))

    consoleErrorSpy.mockRestore()
  })

  it('makes no address queries when signed in but saveAddress is absent', async () => {
    await placeOrder({
      contact: CONTACT,
      address: ADDRESS,
      shippingToken: validShippingToken(),
      chargeCurrency: 'NGN',
    })

    expect(address.findMany).not.toHaveBeenCalled()
    expect(address.create).not.toHaveBeenCalled()
  })
})

describe('placeOrder — rate limiting (the "checkout" window, guarded before any other work)', () => {
  it('limited: returns the typed rate-limited error and writes nothing, never even parsing input', async () => {
    checkRateLimit.mockResolvedValue(false)

    const result = await placeOrder({
      contact: CONTACT,
      address: ADDRESS,
      shippingToken: validShippingToken(),
      chargeCurrency: 'NGN',
      guestLines: [{ productId: PRODUCT_ID, quantity: 1 }],
    })

    expect(checkRateLimit).toHaveBeenCalledWith('checkout')
    expect(result).toEqual({ error: RATE_LIMITED_MESSAGE })
    expect(order.create).not.toHaveBeenCalled()
    expect($transaction).not.toHaveBeenCalled()
    expect(resolveProductsByIds).not.toHaveBeenCalled()
    expect(cartItem.findMany).not.toHaveBeenCalled()
  })
})

describe('placeOrder — charge-currency divergence is logged, not overridden (Phase 9c Task 4)', () => {
  // Phase 9c originally re-derived `chargeCurrency` from the server geo
  // signal and OVERRODE the client's value on a divergence. That was wrong
  // for this product (the charge currency is a designed customer choice —
  // `CurrencySwitcher`, `charge-currency-note` — and both authored
  // currencies are merchant-set with no FX in this path, so the format guard
  // below is the real protection) and has been reverted: `placeOrder` now
  // ALWAYS uses the client's own format-validated `chargeCurrency`, and only
  // logs when the server signal disagrees, for merchant observability.

  it('always uses the client currency end-to-end even when the server signal diverges, logging the divergence', async () => {
    headersMock.mockResolvedValue(headerStore({ 'x-vercel-ip-country': 'US' })) // -> USD server-side
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const result = await placeOrder({
      contact: CONTACT,
      address: ADDRESS,
      // Client claims NGN; the server signal says USD. The effective
      // currency must stay NGN throughout, so the shipping token must be
      // signed for NGN (today's default fixture) to verify.
      shippingToken: validShippingToken(),
      chargeCurrency: 'NGN',
      guestLines: [{ productId: PRODUCT_ID, quantity: 1 }],
    })

    expect(result).toEqual({ ok: true, order: expect.objectContaining({ orderNumber: 'MSE-123456' }) })
    expect(order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          // The persisted Order.currency is the CLIENT's own choice, never
          // silently swapped for the server-observed geo signal.
          currency: 'NGN',
          // Re-priced off PRODUCT's authored NGN price (500_000) — proof the
          // client currency, not the server signal, drove `buildCartLines`.
          subtotalMinor: 500_000,
          shippingMinor: 250_000,
          lines: {
            create: [expect.objectContaining({ unitPriceMinor: 500_000, lineTotalMinor: 500_000 })],
          },
        }),
      }),
    )
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      '[placeOrder] charge-currency divergence — logging only, using the client currency',
      { client: 'NGN', server: 'USD' },
    )

    consoleWarnSpy.mockRestore()
  })

  it('keeps the client currency unchanged, without logging, when the server-derived value agrees', async () => {
    headersMock.mockResolvedValue(headerStore({ 'x-vercel-ip-country': 'NG' })) // -> NGN, same as client
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const result = await placeOrder({
      contact: CONTACT,
      address: ADDRESS,
      shippingToken: validShippingToken(),
      chargeCurrency: 'NGN',
      guestLines: [{ productId: PRODUCT_ID, quantity: 1 }],
    })

    expect(result).toEqual({ ok: true, order: expect.objectContaining({ orderNumber: 'MSE-123456' }) })
    expect(order.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ currency: 'NGN', subtotalMinor: 500_000 }) }),
    )
    expect(consoleWarnSpy).not.toHaveBeenCalled()

    consoleWarnSpy.mockRestore()
  })

  it('keeps the client currency unchanged when the geo header is absent (local dev / non-Vercel) — today’s behaviour', async () => {
    headersMock.mockResolvedValue(headerStore()) // no x-vercel-ip-country
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const result = await placeOrder({
      contact: CONTACT,
      address: ADDRESS,
      shippingToken: validShippingToken(),
      chargeCurrency: 'NGN',
      guestLines: [{ productId: PRODUCT_ID, quantity: 1 }],
    })

    expect(result).toEqual({ ok: true, order: expect.objectContaining({ orderNumber: 'MSE-123456' }) })
    expect(order.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ currency: 'NGN', subtotalMinor: 500_000 }) }),
    )
    expect(consoleWarnSpy).not.toHaveBeenCalled()

    consoleWarnSpy.mockRestore()
  })
})
