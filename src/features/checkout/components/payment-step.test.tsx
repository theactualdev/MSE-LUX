import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PaymentStep } from '@/features/checkout/components/payment-step'

describe('PaymentStep', () => {
  it('explains payment is completed securely via Paystack, with no method picker', () => {
    render(<PaymentStep onContinue={vi.fn()} />)

    expect(screen.getByText(/completed securely via paystack/i)).toBeInTheDocument()
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument()
    expect(screen.queryByText(/no payment is processed/i)).not.toBeInTheDocument()
  })

  it('calls onContinue to advance to review', async () => {
    const user = userEvent.setup({ delay: null })
    const onContinue = vi.fn()
    render(<PaymentStep onContinue={onContinue} />)

    await user.click(screen.getByRole('button', { name: /continue to review/i }))

    expect(onContinue).toHaveBeenCalledTimes(1)
  })
})
