import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LoginForm } from '@/features/account/components/login-form'
import { useAuthStore } from '@/features/account/store'

const push = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  usePathname: () => '/login',
  useSearchParams: () => new URLSearchParams(),
}))

describe('LoginForm', () => {
  beforeEach(() => {
    push.mockClear()
    useAuthStore.setState({ user: null })
  })

  it('shows validation errors and does not call signIn when submitted empty', async () => {
    const user = userEvent.setup()
    render(<LoginForm />)

    await user.click(screen.getByRole('button', { name: /sign in/i }))

    expect(await screen.findAllByText(/required|invalid|must contain/i)).not.toHaveLength(0)
    expect(useAuthStore.getState().user).toBeNull()
    expect(push).not.toHaveBeenCalled()
  })

  it('valid submit signs in and redirects', async () => {
    const user = userEvent.setup()
    render(<LoginForm />)

    await user.type(screen.getByLabelText(/email/i), 'ada@example.com')
    await user.type(screen.getByLabelText(/password/i), 'abcdefgh')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    await vi.waitFor(() => {
      expect(useAuthStore.getState().user?.email).toBe('ada@example.com')
    })
    expect(push).toHaveBeenCalledWith('/account')
  })
})
