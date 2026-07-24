import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Product } from '@/types/catalog'
import type { Contact, Address } from '@/features/checkout/schema'

/**
 * `buildCartLines`, `shippingAmountFor`, and `mapOrderRow` are pure and
 * DB-free, so they run for real here (not mocked) — these tests assert on
 * their actual output, which is exactly the point: the stored
 * `unitPriceMinor` must come from the authored catalog via `buildCartLines`,
 * never from anything the caller supplied.
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
    $transaction: (...args: [(client: typeof tx) => unknown]) => $transaction(...args),
  },
}))

const getCurrentUserId = vi.fn()

vi.mock('@/features/auth/claims', () => ({
  getCurrentUserId: () => getCurrentUserId(),
}))

const resolveProductsByIds = vi.fn()

vi.mock('@/features/catalog/server/resolve-products', () => ({
  resolveProductsByIds: (...args: [string[]]) => resolveProductsByIds(...args),
}))

const { placeOrder } = await import('@/features/checkout/data')

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

// Subtotal for 1x PRODUCT_ID (no variant) in NGN = 500_000. Shipping ('lagos', NGN) = 250_000.
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
  getCurrentUserId.mockResolvedValue(null)
  resolveProductsByIds.mockResolvedValue([PRODUCT])
  order.create.mockResolvedValue(createdRow())
})

describe('placeOrder — guest checkout', () => {
  it('writes an order priced off the authored catalog, never a client value', async () => {
    const result = await placeOrder({
      contact: CONTACT,
      address: ADDRESS,
      shippingMethodId: 'lagos',
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
  })

  it('decrements product inventory (no variant) by the ordered quantity', async () => {
    await placeOrder({
      contact: CONTACT,
      address: ADDRESS,
      shippingMethodId: 'lagos',
      chargeCurrency: 'NGN',
      guestLines: [{ productId: PRODUCT_ID, quantity: 1 }],
    })

    expect(product.update).toHaveBeenCalledWith({
      where: { id: PRODUCT_ID },
      data: { inventory: { decrement: 1 } },
    })
    expect(productVariant.update).not.toHaveBeenCalled()
  })

  it('decrements variant inventory when the line has a variant', async () => {
    order.create.mockResolvedValue(
      createdRow({
        subtotalMinor: 500_000,
        totalMinor: 787_500,
        lines: [{ ...createdRow().lines[0], variantLabel: '18cm' }],
      }),
    )

    await placeOrder({
      contact: CONTACT,
      address: ADDRESS,
      shippingMethodId: 'lagos',
      chargeCurrency: 'NGN',
      guestLines: [{ productId: PRODUCT_ID, variantId: VARIANT_ID, quantity: 2 }],
    })

    expect(productVariant.update).toHaveBeenCalledWith({
      where: { id: VARIANT_ID },
      data: { inventory: { decrement: 2 } },
    })
    expect(product.update).not.toHaveBeenCalled()
  })

  it('clamps a requested quantity above inventory, both in the stored line and the decrement', async () => {
    await placeOrder({
      contact: CONTACT,
      address: ADDRESS,
      shippingMethodId: 'lagos',
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
    expect(product.update).toHaveBeenCalledWith({
      where: { id: PRODUCT_ID },
      data: { inventory: { decrement: 5 } },
    })
  })

  it('returns an error and writes nothing when the cart is empty', async () => {
    await expect(
      placeOrder({
        contact: CONTACT,
        address: ADDRESS,
        shippingMethodId: 'lagos',
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
        shippingMethodId: 'lagos',
        chargeCurrency: 'NGN',
        guestLines: [{ productId: PRODUCT_ID, quantity: 1 }],
      }),
    ).resolves.toEqual({ error: expect.any(String) })

    expect(order.create).not.toHaveBeenCalled()
    expect($transaction).not.toHaveBeenCalled()
  })

  it('returns an error for an unknown shipping method', async () => {
    await expect(
      placeOrder({
        contact: CONTACT,
        address: ADDRESS,
        shippingMethodId: 'does-not-exist',
        chargeCurrency: 'NGN',
        guestLines: [{ productId: PRODUCT_ID, quantity: 1 }],
      }),
    ).resolves.toEqual({ error: expect.any(String) })

    expect(order.create).not.toHaveBeenCalled()
  })

  it('runs the whole placement inside exactly one transaction', async () => {
    await placeOrder({
      contact: CONTACT,
      address: ADDRESS,
      shippingMethodId: 'lagos',
      chargeCurrency: 'NGN',
      guestLines: [{ productId: PRODUCT_ID, quantity: 1 }],
    })

    expect($transaction).toHaveBeenCalledTimes(1)
  })

  it('returns { ok, order } shaped by mapOrderRow', async () => {
    const result = await placeOrder({
      contact: CONTACT,
      address: ADDRESS,
      shippingMethodId: 'lagos',
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
      shippingMethodId: 'lagos',
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
  })

  it('clears the cart after a successful order', async () => {
    await placeOrder({
      contact: CONTACT,
      address: ADDRESS,
      shippingMethodId: 'lagos',
      chargeCurrency: 'NGN',
    })

    expect(cartItem.deleteMany).toHaveBeenCalledWith({ where: { cart: { profileId: USER_ID } } })
  })

  it('returns an error and writes nothing when the signed-in user has no cart rows', async () => {
    cartItem.findMany.mockResolvedValue([])

    await expect(
      placeOrder({ contact: CONTACT, address: ADDRESS, shippingMethodId: 'lagos', chargeCurrency: 'NGN' }),
    ).resolves.toEqual({ error: expect.any(String) })

    expect(order.create).not.toHaveBeenCalled()
    expect(cartItem.deleteMany).not.toHaveBeenCalled()
  })
})
