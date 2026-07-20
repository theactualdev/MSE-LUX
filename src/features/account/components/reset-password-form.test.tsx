import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ResetPasswordForm } from '@/features/account/components/reset-password-form'
import { updatePassword } from '@/features/auth/actions'

vi.mock('@/features/auth/actions', () => ({
  updatePassword: vi.fn(),
}))

const updatePasswordMock = vi.mocked(updatePassword)

describe('ResetPasswordForm', () => {
  beforeEach(() => {
    updatePasswordMock.mockReset()
  })

  it('shows validation errors and does not call updatePassword when submitted empty', async () => {
    const user = userEvent.setup()
    render(<ResetPasswordForm />)

    await user.click(screen.getByRole('button', { name: /reset password/i }))

    expect(await screen.findAllByText(/at least 8 characters/i)).not.toHaveLength(0)
    expect(updatePasswordMock).not.toHaveBeenCalled()
  })

  it('blocks submit when password and confirmation do not match', async () => {
    const user = userEvent.setup()
    render(<ResetPasswordForm />)

    await user.type(screen.getByLabelText(/^new password$/i), 'password123')
    await user.type(screen.getByLabelText(/confirm new password/i), 'password124')
    await user.click(screen.getByRole('button', { name: /reset password/i }))

    expect(await screen.findByText(/passwords do not match/i)).toBeInTheDocument()
    expect(updatePasswordMock).not.toHaveBeenCalled()
  })

  it('valid submit calls updatePassword with only the new password, and shows the success panel', async () => {
    updatePasswordMock.mockResolvedValue({})
    const user = userEvent.setup()
    render(<ResetPasswordForm />)

    await user.type(screen.getByLabelText(/^new password$/i), 'password123')
    await user.type(screen.getByLabelText(/confirm new password/i), 'password123')
    await user.click(screen.getByRole('button', { name: /reset password/i }))

    await vi.waitFor(() => {
      expect(updatePasswordMock).toHaveBeenCalledWith('password123')
    })
    expect(await screen.findByText(/password updated/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /back to sign in/i })).toHaveAttribute('href', '/login')
  })

  it('shows the server error and stays on the form when updatePassword fails', async () => {
    updatePasswordMock.mockResolvedValue({ error: 'Auth session missing' })
    const user = userEvent.setup()
    render(<ResetPasswordForm />)

    await user.type(screen.getByLabelText(/^new password$/i), 'password123')
    await user.type(screen.getByLabelText(/confirm new password/i), 'password123')
    await user.click(screen.getByRole('button', { name: /reset password/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/auth session missing/i)
    expect(screen.queryByText(/password updated/i)).not.toBeInTheDocument()
  })
})
