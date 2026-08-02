import { describe, expect, it } from 'vitest'
import { mapOrderRow, type OrderRowForMapping } from './order-view'

function buildRow(): OrderRowForMapping {
  return {
    orderNumber: 'MSE-1001',
    email: 'jane@example.com',
    status: 'PROCESSING',
    placedAt: new Date('2026-07-24T10:00:00.000Z'),
    shipFullName: 'Jane Doe',
    shipPhone: '+1 555 123 4567',
    shipLine1: '123 Main St',
    shipLine2: null,
    shipCity: 'New York',
    shipState: 'NY',
    shipCountry: 'US',
    shipPostalCode: '10001',
    shippingLabel: 'Standard Shipping',
    currency: 'USD',
    subtotalMinor: 2900,
    shippingMinor: 500,
    taxMinor: 232,
    totalMinor: 3632,
    lines: [
      {
        productName: 'Gold Hoop Earrings',
        variantLabel: null,
        image: null,
        imageAlt: null,
        quantity: 1,
        unitPriceMinor: 2900,
        lineTotalMinor: 2900,
      },
    ],
  }
}

describe('mapOrderRow', () => {
  it('reassembles the address from the ship* columns', () => {
    const view = mapOrderRow(buildRow())

    expect(view.address).toEqual({
      fullName: 'Jane Doe',
      phone: '+1 555 123 4567',
      line1: '123 Main St',
      line2: undefined,
      city: 'New York',
      state: 'NY',
      country: 'US',
      postalCode: '10001',
    })
  })

  it('maps line items with money in the order currency, defaulting nulls', () => {
    const view = mapOrderRow(buildRow())

    expect(view.lines).toHaveLength(1)
    expect(view.lines[0].name).toBe('Gold Hoop Earrings')
    expect(view.lines[0].variantLabel).toBeUndefined()
    expect(view.lines[0].image).toEqual({ src: '', alt: '' })
    expect(view.lines[0].quantity).toBe(1)
    expect(view.lines[0].unitPrice).toEqual({ amountMinor: 2900, currency: 'USD' })
    expect(view.lines[0].lineTotal).toEqual({ amountMinor: 2900, currency: 'USD' })
  })

  it('maps the summary totals in the order currency', () => {
    const view = mapOrderRow(buildRow())

    expect(view.summary).toEqual({
      subtotal: { amountMinor: 2900, currency: 'USD' },
      shipping: { amountMinor: 500, currency: 'USD' },
      tax: { amountMinor: 232, currency: 'USD' },
      total: { amountMinor: 3632, currency: 'USD' },
    })
  })

  it('passes through orderNumber, email, shippingLabel, and status, and formats placedAt as ISO', () => {
    const view = mapOrderRow(buildRow())

    expect(view.orderNumber).toBe('MSE-1001')
    expect(view.email).toBe('jane@example.com')
    expect(view.shippingLabel).toBe('Standard Shipping')
    expect(view.status).toBe('PROCESSING')
    expect(view.placedAt).toBe('2026-07-24T10:00:00.000Z')
  })

  it('maps trackingCarrier and trackingNumber onto the view', () => {
    const row = buildRow()
    row.trackingCarrier = 'GIG Logistics'
    row.trackingNumber = 'GIG-123'
    const view = mapOrderRow(row)

    expect(view.trackingCarrier).toBe('GIG Logistics')
    expect(view.trackingNumber).toBe('GIG-123')
  })

  describe('discount (Phase 10b)', () => {
    it('populates summary.discount when discountMinor > 0', () => {
      const row = buildRow()
      row.discountCode = 'LAUNCH20'
      row.discountPercent = 20
      row.discountMinor = 580 // 20% of the 2900 subtotal fixture
      row.subtotalMinor = 2900
      row.taxMinor = Math.round((2900 - 580) * 0.075)
      row.totalMinor = 2900 - 580 + 500 + row.taxMinor

      const view = mapOrderRow(row)

      expect(view.summary.discount).toEqual({
        code: 'LAUNCH20',
        percentOff: 20,
        amount: { amountMinor: 580, currency: 'USD' },
      })
      // The arithmetic itself must sum correctly — a receipt whose own
      // numbers don't add up is worse than no receipt.
      expect(
        view.summary.subtotal.amountMinor -
          view.summary.discount!.amount.amountMinor +
          view.summary.shipping.amountMinor +
          view.summary.tax.amountMinor,
      ).toBe(view.summary.total.amountMinor)
    })

    it('omits summary.discount entirely when discountMinor is 0, even with a stored code/percent (defence in depth)', () => {
      const row = buildRow()
      row.discountCode = 'LAUNCH20'
      row.discountPercent = 20
      row.discountMinor = 0

      const view = mapOrderRow(row)

      expect(view.summary.discount).toBeUndefined()
      expect(view.summary).not.toHaveProperty('discount')
    })

    it('omits summary.discount when the row predates the discount columns (all three fields absent)', () => {
      const view = mapOrderRow(buildRow())

      expect(view.summary.discount).toBeUndefined()
    })
  })

  it('allows omitting tracking fields from a row literal (backward compatibility)', () => {
    // Verify that a row without the new keys still compiles and maps (with undefined fields)
    const view = mapOrderRow({
      orderNumber: 'MSE-1001',
      email: 'jane@example.com',
      status: 'PROCESSING',
      placedAt: new Date('2026-07-24T10:00:00.000Z'),
      shipFullName: 'Jane Doe',
      shipPhone: '+1 555 123 4567',
      shipLine1: '123 Main St',
      shipLine2: null,
      shipCity: 'New York',
      shipState: 'NY',
      shipCountry: 'US',
      shipPostalCode: '10001',
      shippingLabel: 'Standard Shipping',
      currency: 'USD',
      subtotalMinor: 2900,
      shippingMinor: 500,
      taxMinor: 232,
      totalMinor: 3632,
      lines: [],
    })

    expect(view.trackingCarrier).toBeUndefined()
    expect(view.trackingNumber).toBeUndefined()
  })
})
