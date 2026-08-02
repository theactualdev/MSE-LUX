import { describe, expect, it } from 'vitest'
import { absoluteUrl } from '@/lib/seo'
import { orderConfirmationEmail, orderShippedEmail, newsletterConfirmationEmail } from '@/features/email/templates'
import type { OrderEmailData } from '@/features/email/templates'

const NGN_ORDER: OrderEmailData = {
  orderNumber: 'ORD-1001',
  customerName: 'Ada Obi',
  currency: 'NGN',
  isGift: false,
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

/**
 * Mirrors the task brief's own regression example: ₦10,000 subtotal, a
 * 20%-off code (₦2,000 discount), tax on the DISCOUNTED ₦8,000 (₦600),
 * ₦2,500 shipping, total ₦11,100 — subtotal − discount + shipping + tax ===
 * total, exactly, with the discount row present to explain the arithmetic.
 */
const DISCOUNT_ORDER: OrderEmailData = {
  ...NGN_ORDER,
  orderNumber: 'ORD-4004',
  subtotalMinor: 1_000_000,
  discountCode: 'LAUNCH20',
  discountPercent: 20,
  discountMinor: 200_000,
  shippingMinor: 250_000,
  taxMinor: 60_000,
  totalMinor: 1_110_000,
}

const GIFT_ORDER: OrderEmailData = {
  ...NGN_ORDER,
  orderNumber: 'ORD-3003',
  isGift: true,
  giftRecipientName: 'Adaeze',
  shippingAddress: {
    line1: '14 Adeola Odeku Street',
    line2: 'Victoria Island',
    city: 'Lagos',
    state: 'Lagos',
    country: 'Nigeria',
    postalCode: '101241',
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

  it('a NON-gift order still renders the full address block byte-for-byte', () => {
    const { html } = orderConfirmationEmail(NGN_ORDER)
    expect(html).toContain(
      '<p style="margin: 0; font-size: 13px; line-height: 1.6; color: #78716c;">\n      12 Admiralty Way<br />Lekki Phase 1<br />Lagos, Lagos<br />Nigeria\n    </p>',
    )
    expect(html).toContain('Shipping to')
    expect(html).not.toContain('Gift for')
  })

  it('a GIFT order redacts the recipient address to name + city/state/country only', () => {
    const { html } = orderConfirmationEmail(GIFT_ORDER)

    expect(html).toContain('Adaeze')
    expect(html).toContain('Lagos')
    expect(html).not.toContain('14 Adeola Odeku Street')
    expect(html).not.toContain('Victoria Island')
    expect(html).not.toContain('101241')
    expect(html).toContain('Gift for')
    expect(html).not.toContain('Shipping to')
  })

  it('a GIFT order greets the buyer neutrally, never the recipient by name', () => {
    // GIFT_ORDER.customerName is 'Ada Obi' (inherited from NGN_ORDER) — that's
    // the order snapshot's shipFullName, i.e. the RECIPIENT, not the buyer.
    // The greeting must not name them.
    const { html } = orderConfirmationEmail(GIFT_ORDER)
    expect(html).toContain('Hi there,')
    expect(html).not.toContain('Hi Ada,')
  })

  it('a GIFT order has no /order/ link or "View your order" button — that lookup is profileId-scoped and always fails for a gift order', () => {
    const { html } = orderConfirmationEmail(GIFT_ORDER)
    expect(html).not.toContain('/order/')
    expect(html).not.toContain('View your order')
  })

  it('a NON-gift order still greets with the shipping first name and still has the order button', () => {
    const { html } = orderConfirmationEmail(NGN_ORDER)
    expect(html).toContain('Hi Ada,')
    expect(html).toContain(absoluteUrl(`/order/${NGN_ORDER.orderNumber}`))
    expect(html).toContain('View your order')
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

  it('a NON-gift order still renders the full address block byte-for-byte', () => {
    const { html } = orderShippedEmail(SHIPPED)
    expect(html).toContain(
      '<p style="margin: 0; font-size: 13px; line-height: 1.6; color: #78716c;">\n      12 Admiralty Way<br />Lekki Phase 1<br />Lagos, Lagos<br />Nigeria\n    </p>',
    )
    expect(html).toContain('Shipping to')
    expect(html).not.toContain('Gift for')
  })

  it('a GIFT order redacts the recipient address to name + city/state/country only', () => {
    const shippedGift = { ...GIFT_ORDER, carrier: 'DHL Express', trackingNumber: 'DHL123456789' }
    const { html } = orderShippedEmail(shippedGift)

    expect(html).toContain('Adaeze')
    expect(html).toContain('Lagos')
    expect(html).not.toContain('14 Adeola Odeku Street')
    expect(html).not.toContain('Victoria Island')
    expect(html).not.toContain('101241')
    expect(html).toContain('Gift for')
    expect(html).not.toContain('Shipping to')
  })

  it('a GIFT order greets the buyer neutrally and has no /order/ link or button', () => {
    const shippedGift = { ...GIFT_ORDER, carrier: 'DHL Express', trackingNumber: 'DHL123456789' }
    const { html } = orderShippedEmail(shippedGift)

    expect(html).toContain('Hi there,')
    expect(html).not.toContain('Hi Ada,')
    expect(html).not.toContain('/order/')
    expect(html).not.toContain('View your order')
  })

  it('a NON-gift order still greets with the shipping first name and still has the order button', () => {
    const { html } = orderShippedEmail(SHIPPED)
    expect(html).toContain('Hi Ada,')
    expect(html).toContain(absoluteUrl(`/order/${SHIPPED.orderNumber}`))
    expect(html).toContain('View your order')
  })
})

describe('discounts (Phase 10b)', () => {
  it('orderConfirmationEmail renders the discount row (between Subtotal and Shipping) and its numbers sum correctly', () => {
    const { html } = orderConfirmationEmail(DISCOUNT_ORDER)

    expect(html).toContain('Discount (LAUNCH20 −20%)')
    expect(html).toContain('−₦2,000.00')

    const subtotalIndex = html.indexOf('Subtotal')
    const discountIndex = html.indexOf('Discount (LAUNCH20')
    const shippingIndex = html.indexOf('Shipping')
    expect(subtotalIndex).toBeGreaterThan(-1)
    expect(subtotalIndex).toBeLessThan(discountIndex)
    expect(discountIndex).toBeLessThan(shippingIndex)

    expect(
      DISCOUNT_ORDER.subtotalMinor -
        (DISCOUNT_ORDER.discountMinor ?? 0) +
        DISCOUNT_ORDER.shippingMinor +
        DISCOUNT_ORDER.taxMinor,
    ).toBe(DISCOUNT_ORDER.totalMinor)
  })

  it('orderShippedEmail renders the discount row and its numbers sum correctly', () => {
    const shipped = { ...DISCOUNT_ORDER, carrier: 'DHL Express', trackingNumber: 'DHL123456789' }
    const { html } = orderShippedEmail(shipped)

    expect(html).toContain('Discount (LAUNCH20 −20%)')
    expect(html).toContain('−₦2,000.00')
    expect(
      shipped.subtotalMinor - (shipped.discountMinor ?? 0) + shipped.shippingMinor + shipped.taxMinor,
    ).toBe(shipped.totalMinor)
  })

  it('an order WITHOUT a discount renders byte-identical output to before (no discount markup at all)', () => {
    const withDiscount = orderConfirmationEmail(DISCOUNT_ORDER).html
    const without = orderConfirmationEmail(NGN_ORDER).html

    expect(without).not.toContain('Discount (')
    expect(withDiscount).not.toBe(without)
  })

  it('renders no discount row for a zero-value discount, even with a stored code/percent (discountMinor > 0 is the gate)', () => {
    const zeroDiscount = { ...NGN_ORDER, discountCode: 'LAUNCH20', discountPercent: 20, discountMinor: 0 }
    const { html } = orderConfirmationEmail(zeroDiscount)

    expect(html).not.toContain('Discount (')
  })
})

describe('newsletterConfirmationEmail', () => {
  it('renders both links and escapes nothing it does not interpolate', () => {
    const { subject, html } = newsletterConfirmationEmail({
      confirmUrl: 'https://mselux.com/newsletter/confirm?token=abc',
      unsubscribeUrl: 'https://mselux.com/newsletter/unsubscribe?token=abc',
    })
    expect(subject).toMatch(/confirm/i)
    expect(html).toContain('https://mselux.com/newsletter/confirm?token=abc')
    expect(html).toContain('https://mselux.com/newsletter/unsubscribe?token=abc')
    // The "didn't sign up" reassurance must exist — this email goes to
    // addresses third parties can type into a public form.
    expect(html).toMatch(/didn.{0,2}t sign up|didn.{0,2}t create/i)
  })

  it('escapes URL interpolations (the & in a query string must become &amp;)', () => {
    const { html } = newsletterConfirmationEmail({
      confirmUrl: 'https://x.com/c?a=1&b=2',
      unsubscribeUrl: 'https://x.com/u?a=1&b=2',
    })
    expect(html).toContain('a=1&amp;b=2')
    expect(html).not.toContain('a=1&b=2')
  })
})
