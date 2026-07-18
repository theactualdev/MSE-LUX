import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RequireAuth } from '@/features/account/components/require-auth'
import { useAuthStore } from '@/features/account/store'
import { buildMockUser } from '@/features/account/lib/mock-user'

const replace = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  usePathname: () => '/account',
  useSearchParams: () => new URLSearchParams(),
}))

describe('RequireAuth', () => {
  beforeEach(() => {
    replace.mockClear()
    useAuthStore.setState({ user: null })
  })

  it('redirects to /login and renders no children when there is no user', async () => {
    render(
      <RequireAuth>
        <div>Secret content</div>
      </RequireAuth>,
    )

    await vi.waitFor(() => {
      expect(replace).toHaveBeenCalledWith('/login')
    })
    expect(screen.queryByText('Secret content')).not.toBeInTheDocument()
  })

  it('renders children once hydrated with a signed-in user', async () => {
    useAuthStore.setState({ user: buildMockUser('ada@example.com', 'Ada') })

    render(
      <RequireAuth>
        <div>Secret content</div>
      </RequireAuth>,
    )

    expect(await screen.findByText('Secret content')).toBeInTheDocument()
    expect(replace).not.toHaveBeenCalled()
  })
})
