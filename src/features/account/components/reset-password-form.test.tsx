import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ResetPasswordForm } from '@/features/account/components/reset-password-form'
import { updatePassword } from '@/features/auth/actions'

vi.mock('@/features/auth/actions', () => ({
  updatePassword: vi.fn(),
}))

const updatePasswordMock = vi.mocked(updatePassword)

/**
 * A successful `updatePassword()` calls `redirect('/login')` server-side,
 * which — invoked as a server action from a client event handler — surfaces
 * on the client as a *rejected* promise carrying Next's internal
 * `NEXT_REDIRECT` digest (see actions.ts / reset-password-form.tsx for the
 * full explanation). This reproduces that exact shape so the component is
 * exercised against the real `unstable_rethrow` classifier, not a mock of
 * it — `digest` format taken from `node_modules/next/dist/client/components
 * /redirect.js`'s `getRedirectError`.
 */
function redirectError(url: string) {
  const error = new Error('NEXT_REDIRECT')
  ;(error as Error & { digest: string }).digest = `NEXT_REDIRECT;push;${url};307;`
  return error
}

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

  it('valid submit calls updatePassword with only the new password, and shows no error on the redirect-as-rejection success path', async () => {
    // Fix 2: a successful updatePassword() signs out and redirects
    // server-side rather than resolving, so there is no local success
    // panel any more — the component just has to not show an error.
    updatePasswordMock.mockRejectedValue(redirectError('/login'))
    const user = userEvent.setup()
    render(<ResetPasswordForm />)

    await user.type(screen.getByLabelText(/^new password$/i), 'password123')
    await user.type(screen.getByLabelText(/confirm new password/i), 'password123')
    await user.click(screen.getByRole('button', { name: /reset password/i }))

    await vi.waitFor(() => {
      expect(updatePasswordMock).toHaveBeenCalledWith('password123')
    })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows the server error and stays on the form when updatePassword resolves with an error', async () => {
    updatePasswordMock.mockResolvedValue({
      error: 'This reset link is no longer valid. Request a new one and try again.',
    })
    const user = userEvent.setup()
    render(<ResetPasswordForm />)

    await user.type(screen.getByLabelText(/^new password$/i), 'password123')
    await user.type(screen.getByLabelText(/confirm new password/i), 'password123')
    await user.click(screen.getByRole('button', { name: /reset password/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/no longer valid/i)
  })

  it('shows a generic error and stays on the form when updatePassword rejects for a non-redirect reason', async () => {
    // Fix 4: a genuine transport failure (network drop, server exception)
    // must not be mistaken for the redirect-as-rejection success case.
    updatePasswordMock.mockRejectedValue(new Error('Failed to fetch'))
    const user = userEvent.setup()
    render(<ResetPasswordForm />)

    await user.type(screen.getByLabelText(/^new password$/i), 'password123')
    await user.type(screen.getByLabelText(/confirm new password/i), 'password123')
    await user.click(screen.getByRole('button', { name: /reset password/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/something went wrong/i)
  })
})
