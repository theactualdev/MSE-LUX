import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useSignOut, isSignOutInFlight } from '@/features/auth/use-sign-out'
import { useAuthStore } from '@/features/account/store'
import { signOut } from '@/features/auth/actions'
import { buildMockUser } from '@/features/account/lib/mock-user'

vi.mock('@/features/auth/actions', () => ({
  signOut: vi.fn(),
}))

const signOutMock = vi.mocked(signOut)

function SignOutButton() {
  const handleSignOut = useSignOut()
  return <button onClick={handleSignOut}>Sign out</button>
}

describe('useSignOut', () => {
  beforeEach(() => {
    signOutMock.mockReset()
    useAuthStore.setState({ user: buildMockUser('ada@example.com', 'Ada') })
  })

  it('clears the mock store and sets isSignOutInFlight synchronously on click', async () => {
    let resolveSignOut!: (value: { error?: string }) => void
    signOutMock.mockReturnValue(
      new Promise((resolve) => {
        resolveSignOut = resolve
      }),
    )
    const user = userEvent.setup()
    render(<SignOutButton />)

    await user.click(screen.getByRole('button', { name: /sign out/i }))

    // Both the store clear and the in-flight flag are synchronous side
    // effects of the click, not dependent on signOut() ever settling — this
    // is what lets RequireAuth's effect (which fires on the same tick's
    // re-render) see the flag before it decides whether to redirect.
    expect(useAuthStore.getState().user).toBeNull()
    expect(isSignOutInFlight()).toBe(true)
    expect(signOutMock).toHaveBeenCalled()

    resolveSignOut({})
    await vi.waitFor(() => expect(isSignOutInFlight()).toBe(false))
  })

  it('restores the mock user and clears isSignOutInFlight when signOut resolves with an error', async () => {
    signOutMock.mockResolvedValue({ error: 'Network error' })
    const user = userEvent.setup()
    render(<SignOutButton />)

    await user.click(screen.getByRole('button', { name: /sign out/i }))

    await vi.waitFor(() => {
      expect(useAuthStore.getState().user?.email).toBe('ada@example.com')
    })
    expect(isSignOutInFlight()).toBe(false)
  })

  it('clears isSignOutInFlight without restoring the user when signOut rejects (redirect-as-rejection)', async () => {
    signOutMock.mockRejectedValue(new Error('NEXT_REDIRECT'))
    const user = userEvent.setup()
    render(<SignOutButton />)

    await user.click(screen.getByRole('button', { name: /sign out/i }))

    await vi.waitFor(() => expect(isSignOutInFlight()).toBe(false))
    expect(useAuthStore.getState().user).toBeNull()
  })
})
