import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OrderSummaryPanel } from './order-summary-panel'
import { validateDiscountCode } from '@/features/discounts/actions'
import type { AppliedDiscount, DiscountSummary } from '@/features/discounts/discount-math'
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

// ₦10,000 subtotal, ₦2,500 shipping, ₦750 tax (7.5% of 10,000). No
// `discount` member — the panel no longer computes one itself; it only
// renders what `checkout-flow.tsx` (the single source of truth for the
// displayed summary) hands it.
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

  it('renders the undiscounted totals and no discount row when the given summary has no discount member', () => {
    render(<OrderSummaryPanel lines={[line]} summary={SUMMARY} onDiscountChange={vi.fn()} />)

    expect(screen.getByText('₦10,000.00')).toBeInTheDocument()
    expect(screen.getByText('₦750.00')).toBeInTheDocument()
    expect(screen.getByText('₦13,250.00')).toBeInTheDocument()
    expect(screen.queryByText(/Discount \(/)).not.toBeInTheDocument()
  })

  it('renders exactly the summary it is given, without recomputing a discount itself', () => {
    // Deliberately NOT what `computeDiscountMinor` would derive from
    // `SUMMARY` + a 20% discount (that would be ₦600 tax / ₦11,100 total) —
    // proves the panel renders the passed-in summary as-is rather than
    // deriving its own numbers. The discount is now computed exactly once,
    // in `checkout-flow.tsx`, and handed down complete.
    const discount: DiscountSummary = {
      code: 'LAUNCH20',
      percentOff: 20,
      amount: { amountMinor: 200_000, currency: 'NGN' },
    }
    const givenSummary: CartSummaryModel & { discount?: DiscountSummary } = {
      ...SUMMARY,
      tax: { amountMinor: 12_345, currency: 'NGN' },
      total: { amountMinor: 999_999, currency: 'NGN' },
      discount,
    }

    render(
      <OrderSummaryPanel
        lines={[line]}
        summary={givenSummary}
        discount={{ code: 'LAUNCH20', percentOff: 20 }}
        onDiscountChange={vi.fn()}
      />,
    )

    expect(screen.getByText('Discount (LAUNCH20 −20%)')).toBeInTheDocument()
    expect(screen.getByText('−₦2,000.00')).toBeInTheDocument()
    expect(screen.getByText('₦123.45')).toBeInTheDocument()
    expect(screen.getByText('₦9,999.99')).toBeInTheDocument()
  })

  it('renders no discount row when the given summary has no discount member, even if a code is currently applied in the field', () => {
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

  it('applying a code through the embedded DiscountField reports the parsed code and percentage upward via onDiscountChange', async () => {
    const user = userEvent.setup({ delay: null })
    validateDiscountCodeMock.mockResolvedValue({ ok: true, code: 'LAUNCH20', percentOff: 20 })
    const onDiscountChange = vi.fn()

    // A small controlled harness — `discount` is a prop OrderSummaryPanel
    // does not own, so the test must round-trip `onDiscountChange` back in
    // as `discount` itself (exactly like `checkout-flow.tsx` does) for the
    // field to flip into its applied state.
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
    // The panel itself does not react to this by recomputing totals — that
    // is `checkout-flow.tsx`'s job (it owns `discount` state and recomputes
    // `summary`), so the undiscounted total handed in is still what shows
    // even after the code is applied.
    expect(screen.getByText('₦13,250.00')).toBeInTheDocument()
  })
})
