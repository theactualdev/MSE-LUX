import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { AccountShell } from '@/features/account/components/account-shell'

let pathname = '/account'

vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('@/features/auth/sign-out', () => ({
  handleSignOut: vi.fn(),
}))

const USER = { name: 'Ada Lovelace', email: 'ada@example.com' }

/** The routes that actually render inside this shell. */
const SHELL_ROUTES = ['/account', '/account/orders', '/account/addresses']

beforeEach(() => {
  pathname = '/account'
})

describe('AccountShell', () => {
  it('shows the signed-in identity passed down from the server', () => {
    render(
      <AccountShell user={USER}>
        <p>Panel</p>
      </AccountShell>,
    )

    expect(screen.getByText(/Ada Lovelace/)).toBeInTheDocument()
    expect(screen.getByText(/ada@example\.com/)).toBeInTheDocument()
  })

  it('renders without an identity line when the Profile row is missing', () => {
    // Defensive: the route guard has already proven there IS a session, so
    // this is the trigger-failed case, not the signed-out case — the shell
    // must still render its children rather than blanking out.
    render(
      <AccountShell user={null}>
        <p>Panel</p>
      </AccountShell>,
    )

    expect(screen.getByText('Panel')).toBeInTheDocument()
  })

  it.each(SHELL_ROUTES)('marks %s as the current page when it is active', (route) => {
    pathname = route
    render(
      <AccountShell user={USER}>
        <p>Panel</p>
      </AccountShell>,
    )

    const nav = screen.getByRole('navigation', { name: /account/i })
    const current = within(nav).getAllByRole('link', { current: 'page' })

    expect(current).toHaveLength(1)
    expect(current[0]).toHaveAttribute('href', route)
  })

  it('every link in the account nav is a route that renders inside this shell', () => {
    // Phase 2d's bug: /wishlist sat in this nav but was never wrapped in
    // AccountShell, so selecting it dropped the sidebar and its aria-current
    // could never resolve — one nav item structurally incapable of ever being
    // marked active. This asserts the nav contains only shell routes.
    render(
      <AccountShell user={USER}>
        <p>Panel</p>
      </AccountShell>,
    )

    const nav = screen.getByRole('navigation', { name: /account/i })
    const hrefs = within(nav)
      .getAllByRole('link')
      .map((link) => link.getAttribute('href'))

    expect(hrefs).toEqual(SHELL_ROUTES)
  })

  it('still offers the wishlist, but outside the account nav', () => {
    // /wishlist stays guest-usable and deliberately un-guarded, so it must not
    // be pulled into the dashboard — only linked from beside it.
    render(
      <AccountShell user={USER}>
        <p>Panel</p>
      </AccountShell>,
    )

    const wishlist = screen.getByRole('link', { name: /wishlist/i })
    expect(wishlist).toHaveAttribute('href', '/wishlist')

    const nav = screen.getByRole('navigation', { name: /account/i })
    expect(nav).not.toContainElement(wishlist)
    expect(wishlist).not.toHaveAttribute('aria-current')
  })
})
