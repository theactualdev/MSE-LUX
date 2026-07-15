import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AddressStep } from '@/features/checkout/components/address-step'

describe('AddressStep', () => {
  it('shows validation errors and does not call onSubmit when submitted empty', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()

    render(<AddressStep onSubmit={onSubmit} />)

    await user.click(screen.getByRole('button', { name: /continue/i }))

    expect(await screen.findAllByText(/required/i)).not.toHaveLength(0)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('calls onSubmit with the filled values when valid', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()

    render(<AddressStep onSubmit={onSubmit} />)

    await user.type(screen.getByLabelText(/full name/i), 'Ada Lovelace')
    await user.type(screen.getByLabelText(/phone/i), '08012345678')
    await user.type(screen.getByLabelText(/address line 1/i), '1 Marina Street')
    await user.type(screen.getByLabelText(/^city/i), 'Lagos')
    await user.type(screen.getByLabelText(/^state/i), 'Lagos')

    await user.click(screen.getByRole('button', { name: /continue/i }))

    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        fullName: 'Ada Lovelace',
        phone: '08012345678',
        line1: '1 Marina Street',
        city: 'Lagos',
        state: 'Lagos',
        country: 'Nigeria',
      }),
    )
  })

  it('defaults the country field to Nigeria', () => {
    render(<AddressStep onSubmit={vi.fn()} />)

    expect(screen.getByLabelText(/country/i)).toHaveValue('Nigeria')
  })
})
