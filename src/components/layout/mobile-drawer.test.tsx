import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MobileDrawer } from '@/components/layout/mobile-drawer'
import type { NavItem } from '@/types/nav'

// Nav arrives as a prop from `AppShell` (database-driven) rather than from
// `siteConfig`, so these tests supply their own taxonomy.
const NAV: NavItem[] = [
  { label: 'Jewelry', href: '/jewelry', children: [{ label: 'Necklaces', href: '/jewelry/necklaces' }] },
  { label: 'Collections', href: '/collections' },
]
import { useUiStore } from '@/stores/ui'
import type { ClientSessionState } from '@/features/auth/use-session'

// Same reasoning as `header.test.tsx`: `useSession` constructs the real
// Supabase browser client, which deliberately throws when
// `NEXT_PUBLIC_SUPABASE_*` is unset as it is under test. Stubbing the hook
// (rather than the client) keeps the role controllable per test, which is the
// whole point of the admin-link cases below.
const useSessionMock = vi.fn<() => ClientSessionState>()
vi.mock('@/features/auth/use-session', () => ({ useSession: () => useSessionMock() }))

const CUSTOMER: ClientSessionState = { signedIn: true, role: 'CUSTOMER', loading: false }

beforeEach(() => {
  useUiStore.getState().closeAll()
  useSessionMock.mockReset()
  useSessionMock.mockReturnValue(CUSTOMER)
})

describe('MobileDrawer', () => {
  it('is hidden by default and shown when the store opens it', () => {
    const { rerender } = render(<MobileDrawer nav={NAV} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    useUiStore.getState().openMobileNav()
    rerender(<MobileDrawer nav={NAV} />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  /**
   * `AccountMenu` — which carries the desktop Admin link — is `hidden sm:*`,
   * so the drawer is the ONLY route to /admin on a phone. Without these an
   * admin on mobile has to type the URL, which is the problem the link exists
   * to solve.
   */
  it('shows the Admin link to an ADMIN', () => {
    useSessionMock.mockReturnValue({ signedIn: true, role: 'ADMIN', loading: false })
    useUiStore.getState().openMobileNav()
    render(<MobileDrawer nav={NAV} />)

    expect(screen.getByRole('link', { name: 'Admin' })).toHaveAttribute('href', '/admin')
  })

  it('shows the Admin link to a SUPER_ADMIN', () => {
    useSessionMock.mockReturnValue({ signedIn: true, role: 'SUPER_ADMIN', loading: false })
    useUiStore.getState().openMobileNav()
    render(<MobileDrawer nav={NAV} />)

    expect(screen.getByRole('link', { name: 'Admin' })).toBeInTheDocument()
  })

  it('hides the Admin link from a customer, who still sees Account', () => {
    useUiStore.getState().openMobileNav()
    render(<MobileDrawer nav={NAV} />)

    expect(screen.getByRole('link', { name: 'Account' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument()
  })

  it('hides the Admin link from a signed-out visitor, whatever the role claims', () => {
    useSessionMock.mockReturnValue({ signedIn: false, role: 'ADMIN', loading: false })
    useUiStore.getState().openMobileNav()
    render(<MobileDrawer nav={NAV} />)

    expect(screen.queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument()
  })
})
