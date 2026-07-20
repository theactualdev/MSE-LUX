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

  it('shows the check-your-inbox confirmation even when requestPasswordReset resolves with an error', async () => {
    // Fix 3: server failures (e.g. GoTrue's per-address rate-limit message)
    // must not be distinguishable from success in the UI — that
    // distinguishability is itself an email-enumeration signal.
    requestPasswordResetMock.mockResolvedValue({ error: 'Email rate limit exceeded' })
    const user = userEvent.setup()
    render(<ForgotPasswordForm />)

    await user.type(screen.getByLabelText(/email/i), 'ada@example.com')
    await user.click(screen.getByRole('button', { name: /send reset link/i }))

    expect(await screen.findByText(/check your inbox/i)).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows a generic error and stays on the form when requestPasswordReset rejects (transport failure)', async () => {
    // Fix 4: a genuine transport failure (network drop, server exception) is
    // the one case that should keep the user on the form — the action never
    // throws for a Supabase-reported error, only for this.
    requestPasswordResetMock.mockRejectedValue(new Error('Failed to fetch'))
    const user = userEvent.setup()
    render(<ForgotPasswordForm />)

    await user.type(screen.getByLabelText(/email/i), 'ada@example.com')
    await user.click(screen.getByRole('button', { name: /send reset link/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/something went wrong/i)
    expect(screen.queryByText(/check your inbox/i)).not.toBeInTheDocument()
  })
})
