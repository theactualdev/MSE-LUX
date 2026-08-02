import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CartSummary } from './cart-summary'
import type { CartSummary as CartSummaryModel } from '@/features/cart/lib/summary'
import type { DiscountSummary } from '@/features/discounts/discount-math'

const NO_DISCOUNT_SUMMARY: CartSummaryModel = {
  subtotal: { amountMinor: 1_000_000, currency: 'NGN' }, // ₦10,000
  shipping: { amountMinor: 250_000, currency: 'NGN' }, // ₦2,500
  tax: { amountMinor: 75_000, currency: 'NGN' }, // ₦750 (7.5% of 10,000)
  total: { amountMinor: 1_325_000, currency: 'NGN' }, // ₦13,250
}

/**
 * Mirrors the task brief's own regression example: a 20%-off code on a
 * ₦10,000 subtotal (₦2,000 discount), tax computed on the DISCOUNTED
 * ₦8,000 subtotal (₦600), ₦2,500 shipping, total ₦11,100 — subtotal −
 * discount + shipping + tax === total, exactly.
 */
const DISCOUNT: DiscountSummary = { code: 'LAUNCH20', percentOff: 20, amount: { amountMinor: 200_000, currency: 'NGN' } }
const DISCOUNTED_SUMMARY: CartSummaryModel & { discount: DiscountSummary } = {
  subtotal: { amountMinor: 1_000_000, currency: 'NGN' }, // ₦10,000
  shipping: { amountMinor: 250_000, currency: 'NGN' }, // ₦2,500
  tax: { amountMinor: 60_000, currency: 'NGN' }, // ₦600 (7.5% of the discounted 8,000)
  total: { amountMinor: 1_110_000, currency: 'NGN' }, // ₦11,100
  discount: DISCOUNT,
}

describe('CartSummary', () => {
  it('renders subtotal, shipping, tax, and total, with no discount row when summary.discount is absent', () => {
    render(<CartSummary summary={NO_DISCOUNT_SUMMARY} />)

    expect(screen.getByText('Subtotal')).toBeInTheDocument()
    expect(screen.getByText('Shipping')).toBeInTheDocument()
    expect(screen.getByText('Tax')).toBeInTheDocument()
    expect(screen.getByText('Total')).toBeInTheDocument()
    expect(screen.queryByText(/Discount/)).not.toBeInTheDocument()
  })

  it('an order without a discount is byte-identical to before (no discount markup anywhere)', () => {
    const { container } = render(<CartSummary summary={NO_DISCOUNT_SUMMARY} />)
    expect(container.innerHTML).not.toContain('Discount')
    expect(container.innerHTML).not.toContain('−')
  })

  it('renders the discount row, between Subtotal and Shipping, as a negative amount, whenever summary.discount is present', () => {
    render(<CartSummary summary={DISCOUNTED_SUMMARY} />)

    expect(screen.getByText('Discount (LAUNCH20 −20%)')).toBeInTheDocument()
    expect(screen.getByText('−₦2,000.00')).toBeInTheDocument()

    const rowLabels = screen.getAllByText(/^(Subtotal|Discount|Shipping|Tax|Total)/).map((el) => el.textContent)
    expect(rowLabels).toEqual(['Subtotal', 'Discount (LAUNCH20 −20%)', 'Shipping', 'Tax', 'Total'])
  })

  it("its own numbers sum correctly: subtotal − discount + shipping + tax === total (Step 5's regression guard)", () => {
    const s = DISCOUNTED_SUMMARY
    expect(s.subtotal.amountMinor - s.discount.amount.amountMinor + s.shipping.amountMinor + s.tax.amountMinor).toBe(
      s.total.amountMinor,
    )

    render(<CartSummary summary={s} />)
    expect(screen.getByText('₦10,000.00')).toBeInTheDocument()
    expect(screen.getByText('₦2,500.00')).toBeInTheDocument()
    expect(screen.getByText('₦600.00')).toBeInTheDocument()
    expect(screen.getByText('₦11,100.00')).toBeInTheDocument()
  })
})
