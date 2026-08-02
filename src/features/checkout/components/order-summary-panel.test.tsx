import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OrderSummaryPanel } from './order-summary-panel'
import { validateDiscountCode } from '@/features/discounts/actions'
import type { AppliedDiscount } from '@/features/discounts/discount-math'
import type { CartLine } from '@/features/cart/lib/lines'
import type { CartSummary as CartSummaryModel } from '@/features/cart/lib/summary'
import type { Product } from '@/types/catalog'

vi.mock('@/features/discounts/actions', () => ({
  validateDiscountCode: vi.fn(),
}))

const validateDiscountCodeMock = vi.mocked(validateDiscountCode)

const product = {
  id: 'p1',
  name: 'Aurora Tennis Bracelet',
  images: [{ src: '/aurora.jpg', alt: 'Aurora Tennis Bracelet' }],
  variants: [],
} as unknown as Product

// Deliberately a DIFFERENT amount than the summary fixture below, so
// `CartLineItem`'s own price text can never collide with a `CartSummary`
// row in a text query.
const line: CartLine = {
  product,
  variant: undefined,
  image: { src: '/aurora.jpg', alt: 'Aurora Tennis Bracelet' },
  quantity: 1,
  unitPrice: { amountMinor: 555_555, currency: 'NGN' },
  lineTotal: { amountMinor: 555_555, currency: 'NGN' },
}

// ₦10,000 subtotal, ₦2,500 shipping, ₦750 tax (7.5% of 10,000, no discount
// applied yet — the panel itself is always handed the UNDISCOUNTED summary
// and derives the discounted preview from `discount`).
const SUMMARY: CartSummaryModel = {
  subtotal: { amountMinor: 1_000_000, currency: 'NGN' },
  shipping: { amountMinor: 250_000, currency: 'NGN' },
  tax: { amountMinor: 75_000, currency: 'NGN' },
  total: { amountMinor: 1_325_000, currency: 'NGN' },
}

describe('OrderSummaryPanel', () => {
  beforeEach(() => {
    validateDiscountCodeMock.mockReset()
  })

  it('renders the undiscounted totals and no discount row when no discount is applied', () => {
    render(<OrderSummaryPanel lines={[line]} summary={SUMMARY} onDiscountChange={vi.fn()} />)

    expect(screen.getByText('₦10,000.00')).toBeInTheDocument()
    expect(screen.getByText('₦750.00')).toBeInTheDocument()
    expect(screen.getByText('₦13,250.00')).toBeInTheDocument()
    expect(screen.queryByText(/Discount \(/)).not.toBeInTheDocument()
  })

  it('mirrors the server formula exactly: tax on the discounted subtotal, subtracted before total', () => {
    // 20% off 10,000 = 2,000 discount. Tax = round(8,000 * 0.075) = 600.
    // Total = 8,000 + 2,500 + 600 = 11,100 — matching the task brief's own example.
    render(
      <OrderSummaryPanel
        lines={[line]}
        summary={SUMMARY}
        discount={{ code: 'LAUNCH20', percentOff: 20 }}
        onDiscountChange={vi.fn()}
      />,
    )

    expect(screen.getByText('Discount (LAUNCH20 −20%)')).toBeInTheDocument()
    expect(screen.getByText('−₦2,000.00')).toBeInTheDocument()
    expect(screen.getByText('₦600.00')).toBeInTheDocument()
    expect(screen.getByText('₦11,100.00')).toBeInTheDocument()
    // The subtotal ROW itself stays the gross figure — only tax/total reflect the discount.
    expect(screen.getByText('₦10,000.00')).toBeInTheDocument()
  })

  it('renders no discount row for a 0% discount (defence in depth — discountMinor > 0 is the gate, not the code string)', () => {
    render(
      <OrderSummaryPanel
        lines={[line]}
        summary={SUMMARY}
        discount={{ code: 'ZERO', percentOff: 0 }}
        onDiscountChange={vi.fn()}
      />,
    )

    expect(screen.queryByText(/Discount \(/)).not.toBeInTheDocument()
    expect(screen.getByText('₦13,250.00')).toBeInTheDocument()
  })

  it('applying a code through the embedded DiscountField reports it upward via onDiscountChange, and the panel re-renders the reduced total', async () => {
    const user = userEvent.setup({ delay: null })
    validateDiscountCodeMock.mockResolvedValue({ ok: true, code: 'LAUNCH20', percentOff: 20 })
    const onDiscountChange = vi.fn()

    // A small controlled harness — `discount` is a prop OrderSummaryPanel
    // does not own, so the test must round-trip `onDiscountChange` back in
    // as `discount` itself, exactly like `checkout-flow.tsx` does, to see
    // the totals actually update.
    function Harness() {
      const [discount, setDiscount] = useState<AppliedDiscount | null>(null)
      return (
        <OrderSummaryPanel
          lines={[line]}
          summary={SUMMARY}
          discount={discount}
          onDiscountChange={(next) => {
            onDiscountChange(next)
            setDiscount(next)
          }}
        />
      )
    }

    render(<Harness />)

    await user.type(screen.getByLabelText(/discount code/i), 'launch20')
    await user.click(screen.getByRole('button', { name: /apply/i }))

    await screen.findByRole('button', { name: /remove/i })
    expect(onDiscountChange).toHaveBeenCalledWith({ code: 'LAUNCH20', percentOff: 20 })
    expect(screen.getByText('Discount (LAUNCH20 −20%)')).toBeInTheDocument()
    expect(screen.getByText('₦11,100.00')).toBeInTheDocument()
  })
})
