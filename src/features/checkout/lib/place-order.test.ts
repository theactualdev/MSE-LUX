import { describe, it, expect } from 'vitest'
import type { Money } from '@/types/money'
import type { Product, ProductVariant } from '@/types/catalog'
import type { CartLine } from '@/features/cart/lib/lines'
import type { CartSummary } from '@/features/cart/lib/summary'
import type { ShippingMethod } from '@/features/cart/lib/shipping'
import type { Contact, Address } from '@/features/checkout/schema'
import { buildMockOrder } from '@/features/checkout/lib/place-order'

const ngn = (amountMinor: number): Money => ({ amountMinor, currency: 'NGN' })

const product = {
  id: 'p1',
  name: 'Aurora Tennis Bracelet',
  images: [{ src: '/aurora.jpg', alt: 'Aurora Tennis Bracelet' }],
} as unknown as Product

const variant = {
  id: 'v1',
  options: [
    { name: 'Size', value: '18cm' },
    { name: 'Color', value: 'Gold' },
  ],
} as unknown as ProductVariant

const lines: CartLine[] = [
  {
    product,
    variant,
    image: { src: '/aurora.jpg', alt: 'Aurora Tennis Bracelet' },
    quantity: 2,
    unitPrice: ngn(1_500_000),
    lineTotal: ngn(3_000_000),
  },
  {
    product: { ...product, id: 'p2', name: 'Solitaire Ring' } as unknown as Product,
    variant: undefined,
    image: { src: '/ring.jpg', alt: 'Solitaire Ring' },
    quantity: 1,
    unitPrice: ngn(800_000),
    lineTotal: ngn(800_000),
  },
]

const summary: CartSummary = {
  subtotal: ngn(3_800_000),
  shipping: ngn(250_000),
  tax: ngn(285_000),
  total: ngn(4_335_000),
}

const contact: Contact = { email: 'buyer@example.com' }

const address: Address = {
  fullName: 'Ada Lovelace',
  phone: '08012345678',
  line1: '1 Marina Road',
  city: 'Lagos',
  state: 'Lagos',
  country: 'Nigeria',
}

const shippingMethod: ShippingMethod = {
  id: 'lagos',
  label: 'Lagos delivery',
  amount: ngn(250_000),
  estimatedDays: '1–2 days',
}

describe('buildMockOrder', () => {
  const order = buildMockOrder({
    contact,
    address,
    shippingMethod,
    lines,
    summary,
    orderNumber: 'MSE-2026-0001',
    placedAt: '2026-07-15T10:00:00.000Z',
  })

  it('maps every CartLine to an OrderLine', () => {
    expect(order.lines).toHaveLength(lines.length)
  })

  it('maps name, quantity, and totals per line', () => {
    expect(order.lines[0].name).toBe('Aurora Tennis Bracelet')
    expect(order.lines[0].quantity).toBe(2)
    expect(order.lines[0].unitPrice).toEqual(ngn(1_500_000))
    expect(order.lines[0].lineTotal).toEqual(ngn(3_000_000))
  })

  it('derives variantLabel from variant option values', () => {
    expect(order.lines[0].variantLabel).toBe('18cm / Gold')
  })

  it('leaves variantLabel undefined when the line has no variant', () => {
    expect(order.lines[1].variantLabel).toBeUndefined()
  })

  it('carries contact, address, shipping label, order number, and placedAt', () => {
    expect(order.email).toBe('buyer@example.com')
    expect(order.address).toEqual(address)
    expect(order.shippingLabel).toBe('Lagos delivery')
    expect(order.orderNumber).toBe('MSE-2026-0001')
    expect(order.placedAt).toBe('2026-07-15T10:00:00.000Z')
  })

  it('preserves summary totals exactly', () => {
    expect(order.summary).toEqual(summary)
    expect(order.summary.total).toEqual(ngn(4_335_000))
  })
})
