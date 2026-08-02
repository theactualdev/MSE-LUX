import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useState } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DiscountField } from './discount-field'
import { validateDiscountCode } from '@/features/discounts/actions'
import { computeDiscountMinor, type AppliedDiscount } from '@/features/discounts/discount-math'

vi.mock('@/features/discounts/actions', () => ({
  validateDiscountCode: vi.fn(),
}))

const validateDiscountCodeMock = vi.mocked(validateDiscountCode)

const SUBTOTAL_MINOR = 1_000_000 // ₦10,000

/**
 * Mirrors exactly how a real summary derives its displayed total from
 * `DiscountField`'s reported `{ code, percentOff }` — via `computeDiscountMinor`,
 * never a value `DiscountField` computes itself. Proves the plumbing without
 * standing up a whole `OrderSummaryPanel`.
 */
function Harness() {
  const [discount, setDiscount] = useState<AppliedDiscount | null>(null)
  const discountMinor = discount ? computeDiscountMinor(SUBTOTAL_MINOR, discount.percentOff) : 0
  const total = SUBTOTAL_MINOR - discountMinor

  return (
    <div>
      <DiscountField value={discount} onChange={setDiscount} />
      <p data-testid="total">{total}</p>
    </div>
  )
}

describe('DiscountField', () => {
  beforeEach(() => {
    validateDiscountCodeMock.mockReset()
  })

  it('mounts the role="status" region from first render, empty', () => {
    render(<Harness />)
    const status = screen.getByRole('status')
    expect(status).toBeInTheDocument()
    expect(status).toHaveTextContent('')
  })

  it('a valid code shows the applied discount and reduces the total', async () => {
    const user = userEvent.setup({ delay: null })
    validateDiscountCodeMock.mockResolvedValue({ ok: true, code: 'LAUNCH20', percentOff: 20 })

    render(<Harness />)

    await user.type(screen.getByLabelText(/discount code/i), 'launch20')
    await user.click(screen.getByRole('button', { name: /apply/i }))

    // The applied state shows a Remove control, not the Apply/input pair —
    // waiting on it is also what lets the async `handleApply` settle before
    // the assertions below.
    expect(await screen.findByRole('button', { name: /remove/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /apply/i })).not.toBeInTheDocument()
    expect(screen.getByTestId('total')).toHaveTextContent(String(SUBTOTAL_MINOR - 200_000))
    expect(screen.getByRole('status')).toHaveTextContent(/LAUNCH20 applied/i)
  })

  it('an invalid code shows the action error and leaves the total unchanged', async () => {
    const user = userEvent.setup({ delay: null })
    validateDiscountCodeMock.mockResolvedValue({ ok: false, error: "That code isn't valid." })

    render(<Harness />)

    await user.type(screen.getByLabelText(/discount code/i), 'nope')
    await user.click(screen.getByRole('button', { name: /apply/i }))

    expect(await screen.findByRole('status')).toHaveTextContent("That code isn't valid.")
    expect(screen.getByTestId('total')).toHaveTextContent(String(SUBTOTAL_MINOR))
    expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument()
  })

  it('removing an applied code restores the original total', async () => {
    const user = userEvent.setup({ delay: null })
    validateDiscountCodeMock.mockResolvedValue({ ok: true, code: 'LAUNCH20', percentOff: 20 })

    render(<Harness />)

    await user.type(screen.getByLabelText(/discount code/i), 'launch20')
    await user.click(screen.getByRole('button', { name: /apply/i }))
    await screen.findByRole('button', { name: /remove/i })

    expect(screen.getByTestId('total')).toHaveTextContent(String(SUBTOTAL_MINOR - 200_000))

    await user.click(screen.getByRole('button', { name: /remove/i }))

    expect(screen.getByTestId('total')).toHaveTextContent(String(SUBTOTAL_MINOR))
    expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument()
    expect(screen.getByLabelText(/discount code/i)).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(/removed/i)
  })

  it('disables the input and Apply button while validating, re-enabling once the result lands', async () => {
    const user = userEvent.setup({ delay: null })
    let resolveValidate!: (value: Awaited<ReturnType<typeof validateDiscountCode>>) => void
    validateDiscountCodeMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveValidate = resolve
        }),
    )

    render(<Harness />)

    await user.type(screen.getByLabelText(/discount code/i), 'nope')
    await user.click(screen.getByRole('button', { name: /apply/i }))

    expect(screen.getByLabelText(/discount code/i)).toBeDisabled()
    expect(screen.getByRole('button', { name: /apply/i })).toBeDisabled()

    resolveValidate({ ok: false, error: "That code isn't valid." })

    await waitFor(() => expect(screen.getByLabelText(/discount code/i)).not.toBeDisabled())
  })
})
