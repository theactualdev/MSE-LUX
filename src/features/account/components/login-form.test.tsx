import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LoginForm } from '@/features/account/components/login-form'
import { signIn } from '@/features/auth/actions'

const push = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  usePathname: () => '/login',
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('@/features/auth/actions', () => ({
  signIn: vi.fn(),
}))

const signInMock = vi.mocked(signIn)

describe('LoginForm', () => {
  beforeEach(() => {
    push.mockClear()
    signInMock.mockReset()
  })

  it('shows validation errors and does not call signIn when submitted empty', async () => {
    const user = userEvent.setup()
    render(<LoginForm />)

    await user.click(screen.getByRole('button', { name: /sign in/i }))

    expect(await screen.findAllByText(/required|invalid|must contain/i)).not.toHaveLength(0)
    expect(signInMock).not.toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
  })

  it('valid submit calls the signIn action and redirects on success', async () => {
    signInMock.mockResolvedValue({})
    const user = userEvent.setup()
    render(<LoginForm />)

    await user.type(screen.getByLabelText(/email/i), 'ada@example.com')
    await user.type(screen.getByLabelText(/password/i), 'abcdefgh')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    await vi.waitFor(() => {
      expect(signInMock).toHaveBeenCalledWith({ email: 'ada@example.com', password: 'abcdefgh' })
    })
    expect(push).toHaveBeenCalledWith('/account')
  })

  it('shows the server error and does not redirect when signIn fails', async () => {
    signInMock.mockResolvedValue({ error: 'Invalid login credentials' })
    const user = userEvent.setup()
    render(<LoginForm />)

    await user.type(screen.getByLabelText(/email/i), 'ada@example.com')
    await user.type(screen.getByLabelText(/password/i), 'wrongpass1')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/invalid login credentials/i)
    expect(push).not.toHaveBeenCalled()
  })

  it('shows initialError (from /auth/callback via the login page) in the shared alert region on first render', () => {
    render(<LoginForm initialError="This password reset link is no longer valid. Request a new one and try again." />)

    expect(screen.getByRole('alert')).toHaveTextContent(/reset link is no longer valid/i)
  })

  it('clears initialError once a fresh submission starts', async () => {
    signInMock.mockResolvedValue({})
    const user = userEvent.setup()
    render(<LoginForm initialError="We couldn't sign you in. Please try again." />)

    expect(screen.getByRole('alert')).toBeInTheDocument()

    await user.type(screen.getByLabelText(/email/i), 'ada@example.com')
    await user.type(screen.getByLabelText(/password/i), 'abcdefgh')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    await vi.waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
  })

  it('shows a generic error and does not redirect when signIn rejects (transport failure)', async () => {
    // Fix 4: previously an unhandled rejection here — the button just
    // re-enabled with no feedback and no role="alert".
    signInMock.mockRejectedValue(new Error('Failed to fetch'))
    const user = userEvent.setup()
    render(<LoginForm />)

    await user.type(screen.getByLabelText(/email/i), 'ada@example.com')
    await user.type(screen.getByLabelText(/password/i), 'wrongpass1')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/something went wrong/i)
    expect(push).not.toHaveBeenCalled()
  })
})
