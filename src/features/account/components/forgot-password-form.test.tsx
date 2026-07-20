import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ForgotPasswordForm } from '@/features/account/components/forgot-password-form'
import { requestPasswordReset } from '@/features/auth/actions'

vi.mock('@/features/auth/actions', () => ({
  requestPasswordReset: vi.fn(),
}))

const requestPasswordResetMock = vi.mocked(requestPasswordReset)

describe('ForgotPasswordForm', () => {
  beforeEach(() => {
    requestPasswordResetMock.mockReset()
  })

  it('shows a validation error and does not call requestPasswordReset when submitted empty', async () => {
    const user = userEvent.setup()
    render(<ForgotPasswordForm />)

    await user.click(screen.getByRole('button', { name: /send reset link/i }))

    expect(await screen.findAllByText(/invalid|required/i)).not.toHaveLength(0)
    expect(requestPasswordResetMock).not.toHaveBeenCalled()
  })

  it('valid submit calls requestPasswordReset and shows the check-your-inbox confirmation', async () => {
    requestPasswordResetMock.mockResolvedValue({})
    const user = userEvent.setup()
    render(<ForgotPasswordForm />)

    await user.type(screen.getByLabelText(/email/i), 'ada@example.com')
    await user.click(screen.getByRole('button', { name: /send reset link/i }))

    await vi.waitFor(() => {
      expect(requestPasswordResetMock).toHaveBeenCalledWith('ada@example.com')
    })
    expect(await screen.findByText(/check your inbox/i)).toBeInTheDocument()
    expect(screen.getByText('ada@example.com')).toBeInTheDocument()
  })

  it('shows the server error and stays on the form when requestPasswordReset fails', async () => {
    requestPasswordResetMock.mockResolvedValue({ error: 'Email rate limit exceeded' })
    const user = userEvent.setup()
    render(<ForgotPasswordForm />)

    await user.type(screen.getByLabelText(/email/i), 'ada@example.com')
    await user.click(screen.getByRole('button', { name: /send reset link/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/email rate limit exceeded/i)
    expect(screen.queryByText(/check your inbox/i)).not.toBeInTheDocument()
  })
})
