import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Product } from '@/types/catalog'
import type { ResolvedShare } from '@/features/gifting/share'

/**
 * `buildCartLines` and `TAX_RATE` are deliberately REAL here (not mocked):
 * the whole point of these tests is that a gift order's stored
 * `unitPriceMinor`/`subtotalMinor` come from the authored catalog through the
 * same builder `placeOrder` uses, never from anything a buyer supplied. Only
 * the DB, the catalog lookup and `next/headers` are doubled.
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

const { createGiftOrder } = await import('@/features/gifting/gift-order')

const SHARE: ResolvedShare = {
  wishlistId: 'w1',
  recipientFirstName: 'Adaeze',
  city: 'Victoria Island',
  state: 'Lagos',
  country: 'Nigeria',
  address: {
    fullName: 'Adaeze Okonkwo',
    phone: '+2348000000000',
    line1: '14 Adeola Odeku Street',
    line2: null,
    city: 'Victoria Island',
    state: 'Lagos',
    country: 'Nigeria',
    postalCode: '101241',
  },
  productIds: ['p1'],
}

/** Minimal authored-catalog product; only the fields the pricing path reads matter. */
function product(overrides: Partial<Product> & { id: string }): Product {
  return {
    name: 'Coral Strand',
    slug: 'coral-strand',
    shortDescription: '',
    description: '',
    priceSet: { ngn: { amountMinor: 100_000, currency: 'NGN' }, usd: { amountMinor: 6_000, currency: 'USD' } },
    sku: `SKU-${overrides.id}`,
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
    ...overrides,
  } as Product
}

const P1 = product({ id: 'p1' })

const QUOTE = { label: 'Standard', amountMinor: 250_000, currency: 'NGN' as const }

beforeEach(() => {
  vi.clearAllMocks()
  order.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    ...data,
    id: 'o1',
    lines: [],
  }))
})

describe('createGiftOrder — what may be ordered', () => {
  it('drops selections that are not on the wishlist', async () => {
    resolveProductsByIds.mockResolvedValue([P1])

    const result = await createGiftOrder({
      share: SHARE,
      selections: [
        { productId: 'p1', variantId: null },
        { productId: 'NOT-ON-LIST', variantId: null },
      ],
      email: 'buyer@example.com',
      chargeCurrency: 'NGN',
      quote: QUOTE,
    })

    expect(result.ok).toBe(true)
    // The off-list id never even reaches the catalog lookup.
    expect(resolveProductsByIds).toHaveBeenCalledWith(['p1'])
    expect(order.create.mock.calls[0][0].data.lines.create).toHaveLength(1)
  })

  it('refuses when nothing selectable remains', async () => {
    resolveProductsByIds.mockResolvedValue([])

    const result = await createGiftOrder({
      share: SHARE,
      selections: [{ productId: 'p1', variantId: null }],
      email: 'b@e.com',
      chargeCurrency: 'NGN',
      quote: QUOTE,
    })

    expect(result.ok).toBe(false)
    expect(order.create).not.toHaveBeenCalled()
  })

  it('refuses without touching the catalog when every selection is off-list', async () => {
    const result = await createGiftOrder({
      share: SHARE,
      selections: [{ productId: 'NOT-ON-LIST', variantId: null }],
      email: 'b@e.com',
      chargeCurrency: 'NGN',
      quote: QUOTE,
    })

    expect(result.ok).toBe(false)
    expect(resolveProductsByIds).not.toHaveBeenCalled()
    expect(order.create).not.toHaveBeenCalled()
  })

  it('drops an out-of-stock line and refuses when that empties the order', async () => {
    resolveProductsByIds.mockResolvedValue([product({ id: 'p1', inventory: 0 })])

    const result = await createGiftOrder({
      share: SHARE,
      selections: [{ productId: 'p1', variantId: null }],
      email: 'b@e.com',
      chargeCurrency: 'NGN',
      quote: QUOTE,
    })

    expect(result.ok).toBe(false)
    expect(order.create).not.toHaveBeenCalled()
  })

  it('drops an out-of-stock line but still places the rest', async () => {
    const share: ResolvedShare = { ...SHARE, productIds: ['p1', 'p2'] }
    resolveProductsByIds.mockResolvedValue([P1, product({ id: 'p2', inventory: 0 })])

    const result = await createGiftOrder({
      share,
      selections: [
        { productId: 'p1', variantId: null },
        { productId: 'p2', variantId: null },
      ],
      email: 'b@e.com',
      chargeCurrency: 'NGN',
      quote: QUOTE,
    })

    expect(result.ok).toBe(true)
    const lines = order.create.mock.calls[0][0].data.lines.create
    expect(lines).toHaveLength(1)
    expect(lines[0].productId).toBe('p1')
  })

  it('is always quantity 1 per selection — a wishlist has no quantity, and a repeated selection collapses', async () => {
    resolveProductsByIds.mockResolvedValue([P1])

    await createGiftOrder({
      share: SHARE,
      selections: [
        { productId: 'p1', variantId: null },
        { productId: 'p1', variantId: null },
        { productId: 'p1', variantId: null },
      ],
      email: 'b@e.com',
      chargeCurrency: 'NGN',
      quote: QUOTE,
    })

    const data = order.create.mock.calls[0][0].data
    expect(data.lines.create).toHaveLength(1)
    expect(data.lines.create[0].quantity).toBe(1)
    expect(data.subtotalMinor).toBe(100_000)
  })
})

describe('createGiftOrder — the created order', () => {
  it('stamps isGift, the recipient first name, and the OWNER address', async () => {
    resolveProductsByIds.mockResolvedValue([P1])

    await createGiftOrder({
      share: SHARE,
      selections: [{ productId: 'p1', variantId: null }],
      email: 'buyer@example.com',
      chargeCurrency: 'NGN',
      quote: QUOTE,
    })

    const data = order.create.mock.calls[0][0].data
    expect(data.isGift).toBe(true)
    expect(data.giftRecipientName).toBe('Adaeze')
    expect(data.shipFullName).toBe('Adaeze Okonkwo')
    expect(data.shipLine1).toBe('14 Adeola Odeku Street')
    expect(data.shipLine2).toBeNull()
    expect(data.shipPhone).toBe('+2348000000000')
    expect(data.shipCity).toBe('Victoria Island')
    expect(data.shipState).toBe('Lagos')
    expect(data.shipCountry).toBe('Nigeria')
    expect(data.shipPostalCode).toBe('101241')
    // The BUYER's email — they are the one who gets the receipt.
    expect(data.email).toBe('buyer@example.com')
    // Never the owner's profile: a gift must not appear in the recipient's
    // own account, or the surprise is gone.
    expect(data.profileId).toBeNull()
    expect(data.status).toBe('PENDING')
  })

  it('prices off the authored catalog: subtotal from buildCartLines, tax on subtotal, shipping from the verified quote', async () => {
    resolveProductsByIds.mockResolvedValue([P1])

    const result = await createGiftOrder({
      share: SHARE,
      selections: [{ productId: 'p1', variantId: null }],
      email: 'b@e.com',
      chargeCurrency: 'NGN',
      quote: QUOTE,
    })

    expect(result).toEqual({ ok: true, orderNumber: expect.stringMatching(/^MSE-\d{6}$/) })

    const data = order.create.mock.calls[0][0].data
    expect(data.currency).toBe('NGN')
    expect(data.subtotalMinor).toBe(100_000) // authored NGN price, not anything supplied
    expect(data.shippingMinor).toBe(250_000) // the verified quote's amount
    expect(data.shippingLabel).toBe('Standard')
    expect(data.taxMinor).toBe(7_500) // TAX_RATE (0.075) on subtotal
    expect(data.totalMinor).toBe(357_500)
    expect(data.lines.create[0]).toMatchObject({
      productId: 'p1',
      productName: 'Coral Strand',
      quantity: 1,
      unitPriceMinor: 100_000,
      lineTotalMinor: 100_000,
    })
  })

  it('prices in the charge currency the buyer is charged in', async () => {
    resolveProductsByIds.mockResolvedValue([P1])

    await createGiftOrder({
      share: SHARE,
      selections: [{ productId: 'p1', variantId: null }],
      email: 'b@e.com',
      chargeCurrency: 'USD',
      quote: { label: 'International', amountMinor: 2_500, currency: 'USD' },
    })

    const data = order.create.mock.calls[0][0].data
    expect(data.currency).toBe('USD')
    expect(data.subtotalMinor).toBe(6_000) // the authored USD price
    expect(data.shippingMinor).toBe(2_500)
  })

  it('binds the order to the buyer session with the guest-order cookie — a gift order has no profileId to scope it by', async () => {
    resolveProductsByIds.mockResolvedValue([P1])

    const result = await createGiftOrder({
      share: SHARE,
      selections: [{ productId: 'p1', variantId: null }],
      email: 'b@e.com',
      chargeCurrency: 'NGN',
      quote: QUOTE,
    })

    if (!result.ok) throw new Error('expected ok')
    expect(cookieStore.set).toHaveBeenCalledWith(
      'mse_guest_order',
      result.orderNumber,
      expect.objectContaining({ httpOnly: true, sameSite: 'lax', path: '/' }),
    )
  })
})

describe('createGiftOrder — orderNumber collisions', () => {
  it('retries with a fresh number in a fresh transaction', async () => {
    resolveProductsByIds.mockResolvedValue([P1])

    let attempt = 0
    order.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
      attempt += 1
      if (attempt === 1) throw Object.assign(new Error('duplicate'), { code: 'P2002' })
      return { ...data, id: 'o1', lines: [] }
    })

    const result = await createGiftOrder({
      share: SHARE,
      selections: [{ productId: 'p1', variantId: null }],
      email: 'b@e.com',
      chargeCurrency: 'NGN',
      quote: QUOTE,
    })

    expect(result.ok).toBe(true)
    expect(order.create).toHaveBeenCalledTimes(2)
    expect($transaction).toHaveBeenCalledTimes(2)
    const first = order.create.mock.calls[0][0].data.orderNumber
    const second = order.create.mock.calls[1][0].data.orderNumber
    expect(first).not.toBe(second)
  })

  it('gives up after the attempt budget rather than looping forever', async () => {
    resolveProductsByIds.mockResolvedValue([P1])
    order.create.mockRejectedValue(Object.assign(new Error('duplicate'), { code: 'P2002' }))

    const result = await createGiftOrder({
      share: SHARE,
      selections: [{ productId: 'p1', variantId: null }],
      email: 'b@e.com',
      chargeCurrency: 'NGN',
      quote: QUOTE,
    })

    expect(result.ok).toBe(false)
    expect(order.create).toHaveBeenCalledTimes(5)
  })
})
