import { describe, expect, it } from 'vitest'
import { absoluteUrl } from '@/lib/seo'
import { orderConfirmationEmail, orderShippedEmail } from '@/features/email/templates'
import type { OrderEmailData } from '@/features/email/templates'

const NGN_ORDER: OrderEmailData = {
  orderNumber: 'ORD-1001',
  customerName: 'Ada Obi',
  currency: 'NGN',
  lines: [
    { name: 'Gold Signet Ring', variantLabel: 'Size 7', quantity: 1, lineTotalMinor: 4_500_000 },
    { name: 'Silver Bangle', quantity: 2, lineTotalMinor: 2_000_000 },
  ],
  subtotalMinor: 6_500_000,
  shippingMinor: 250_000,
  taxMinor: 0,
  totalMinor: 6_750_000,
  shippingAddress: {
    line1: '12 Admiralty Way',
    line2: 'Lekki Phase 1',
    city: 'Lagos',
    state: 'Lagos',
    country: 'Nigeria',
  },
}

const USD_ORDER: OrderEmailData = {
  ...NGN_ORDER,
  orderNumber: 'ORD-2002',
  customerName: 'Grace Bello',
  currency: 'USD',
  lines: [{ name: 'Pearl Necklace', quantity: 1, lineTotalMinor: 12_000 }],
  subtotalMinor: 12_000,
  shippingMinor: 1_500,
  taxMinor: 0,
  totalMinor: 13_500,
  shippingAddress: {
    line1: '221B Baker Street',
    city: 'New York',
    state: 'NY',
    country: 'USA',
  },
}

const UNESCAPED_ORDER: OrderEmailData = {
  ...NGN_ORDER,
  orderNumber: 'ORD-9999',
  customerName: 'Tom & Jerry <script>alert(1)</script>',
  lines: [{ name: '<script>alert(1)</script>', variantLabel: 'S&M "special"', quantity: 1, lineTotalMinor: 1_000 }],
  shippingAddress: {
    line1: '<img src=x onerror=alert(1)>',
    line2: "Tom & Jerry's Place",
    city: 'Lagos',
    state: 'Lagos',
    country: 'Nigeria',
  },
}

describe('orderConfirmationEmail', () => {
  it('subject contains the order number', () => {
    const { subject } = orderConfirmationEmail(NGN_ORDER)
    expect(subject).toContain(NGN_ORDER.orderNumber)
    expect(subject.toLowerCase()).toContain('confirmed')
  })

  it('html contains the customer first name, every line name + quantity, and the order link', () => {
    const { html } = orderConfirmationEmail(NGN_ORDER)

    expect(html).toContain('Ada')
    for (const line of NGN_ORDER.lines) {
      expect(html).toContain(line.name)
      expect(html).toContain(String(line.quantity))
    }
    expect(html).toContain(absoluteUrl(`/order/${NGN_ORDER.orderNumber}`))
  })

  it('formats the total in the order currency without conversion — NGN glyph for an NGN order', () => {
    const { html } = orderConfirmationEmail(NGN_ORDER)
    expect(html).toContain('₦')
    expect(html).not.toContain('$67,500')
  })

  it('formats the total in the order currency without conversion — $ for a USD order', () => {
    const { html } = orderConfirmationEmail(USD_ORDER)
    expect(html).toContain('$')
    expect(html).not.toContain('₦')
  })

  it('escapes an unsafe line name and address (no raw <script> or unescaped &)', () => {
    const { html } = orderConfirmationEmail(UNESCAPED_ORDER)

    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).not.toContain('<img src=x onerror=alert(1)>')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
    expect(html).toContain('Tom &amp; Jerry')
    expect(html).toContain('S&amp;M &quot;special&quot;')
  })
})

describe('orderShippedEmail', () => {
  const SHIPPED = { ...NGN_ORDER, carrier: 'DHL Express', trackingNumber: 'DHL123456789' }

  it('subject contains the order number', () => {
    const { subject } = orderShippedEmail(SHIPPED)
    expect(subject).toContain(SHIPPED.orderNumber)
    expect(subject.toLowerCase()).toContain('shipped')
  })

  it('html contains the customer first name, every line name + quantity, the order link, carrier and tracking number', () => {
    const { html } = orderShippedEmail(SHIPPED)

    expect(html).toContain('Ada')
    for (const line of SHIPPED.lines) {
      expect(html).toContain(line.name)
      expect(html).toContain(String(line.quantity))
    }
    expect(html).toContain(absoluteUrl(`/order/${SHIPPED.orderNumber}`))
    expect(html).toContain('DHL Express')
    expect(html).toContain('DHL123456789')
  })

  it('formats the total in the order currency without conversion', () => {
    const usdShipped = { ...USD_ORDER, carrier: 'FedEx', trackingNumber: 'FX998877' }
    const { html } = orderShippedEmail(usdShipped)
    expect(html).toContain('$')
    expect(html).not.toContain('₦')
  })

  it('escapes an unsafe line name and address', () => {
    const shipped = { ...UNESCAPED_ORDER, carrier: 'DHL', trackingNumber: 'X1' }
    const { html } = orderShippedEmail(shipped)

    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).not.toContain('<img src=x onerror=alert(1)>')
  })
})
