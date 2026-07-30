import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AccountMenu } from '@/features/account/components/account-menu'
import type { ClientSessionState } from '@/features/auth/use-session'

vi.mock('next/navigation', () => ({
  usePathname: () => '/account',
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('@/features/auth/sign-out', () => ({ handleSignOut: vi.fn() }))

const useSessionMock = vi.fn<() => ClientSessionState>()
vi.mock('@/features/auth/use-session', () => ({ useSession: () => useSessionMock() }))

beforeEach(() => {
  useSessionMock.mockReset()
})

/**
 * Base UI mounts the popup asynchronously, so a synchronous `getByRole`
 * straight after the click races it — that flaked here, failing for one role
 * and passing for another on the same code path. Awaiting a known item is what
 * makes "the menu is open" true before anything is asserted about its contents.
 */
async function openMenu() {
  const user = userEvent.setup()
  render(<AccountMenu />)
  await user.click(screen.getByRole('button', { name: 'Account menu' }))
  await screen.findByRole('menuitem', { name: 'Profile' })
}

describe('AccountMenu admin link', () => {
  /**
   * The point of the whole feature: `/admin` `notFound()`s for non-admins
   * rather than 403ing, deliberately concealing that it exists. An
   * unconditional menu item would undo that for every customer.
   */
  it('is hidden from a signed-in CUSTOMER', async () => {
    useSessionMock.mockReturnValue({ signedIn: true, role: 'CUSTOMER', loading: false })
    await openMenu()

    expect(screen.getByRole('menuitem', { name: 'Profile' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: /admin/i })).not.toBeInTheDocument()
  })

  it('is shown to an ADMIN', async () => {
    useSessionMock.mockReturnValue({ signedIn: true, role: 'ADMIN', loading: false })
    await openMenu()

    expect(await screen.findByRole('menuitem', { name: 'Admin' })).toHaveAttribute('href', '/admin')
  })

  /** SUPER_ADMIN outranks ADMIN, so it must satisfy the same check. */
  it('is shown to a SUPER_ADMIN', async () => {
    useSessionMock.mockReturnValue({ signedIn: true, role: 'SUPER_ADMIN', loading: false })
    await openMenu()

    expect(await screen.findByRole('menuitem', { name: 'Admin' })).toBeInTheDocument()
  })

  it('renders no menu at all when signed out, whatever the role claims', () => {
    useSessionMock.mockReturnValue({ signedIn: false, role: 'ADMIN', loading: false })
    render(<AccountMenu />)

    expect(screen.queryByRole('button', { name: 'Account menu' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sign in' })).toBeInTheDocument()
  })
})
