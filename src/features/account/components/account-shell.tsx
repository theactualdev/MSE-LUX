'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Container } from '@/components/brand/container'
import { handleSignOut } from '@/features/auth/sign-out'
import { cn } from '@/lib/utils'

interface AccountShellProps {
  /**
   * The signed-in user's display identity, resolved server-side by the page
   * (`getProfile()`) and passed down. `null` only in the defensive case where
   * the `Profile` row is missing despite a valid session — the route guard
   * has already established that the visitor *is* authenticated, so this is
   * never the signed-out case.
   */
  user: { name: string; email: string } | null
  children: ReactNode
}

/**
 * Destinations that render *inside* this shell. `/wishlist` is deliberately
 * absent — see `WISHLIST_LINK` below.
 */
const NAV_LINKS = [
  { href: '/account', label: 'Profile' },
  { href: '/account/orders', label: 'Orders' },
  { href: '/account/addresses', label: 'Addresses' },
]

/**
 * Phase 2d logged that `/wishlist` sat in this nav while not being wrapped in
 * `AccountShell`: selecting it dropped the sidebar entirely, so its
 * `aria-current="page"` could never resolve — the one item in the list that
 * was structurally incapable of ever being marked active.
 *
 * The fix is *not* to pull `/wishlist` into the shell: the wishlist is
 * deliberately guest-usable (it's backed by a client store and reachable from
 * the header heart icon without an account), and rendering it inside an
 * account dashboard would imply an auth requirement it doesn't have — and
 * would tempt a future change to put it behind `requireUser()`.
 *
 * Instead the link moves out of the `aria-label="Account"` nav and sits
 * beside it as what it actually is: a link *away* from the dashboard, to a
 * page anyone can use. Nothing inside the account nav can now fail to
 * resolve `aria-current`, because every entry in it renders in this shell.
 */
const WISHLIST_LINK = { href: '/wishlist', label: 'Wishlist' }

const LINK_BASE =
  'shrink-0 rounded-lg px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors'
const LINK_INACTIVE = 'text-muted-foreground hover:bg-muted hover:text-foreground'

/**
 * Two-column account dashboard shell. A header shows the signed-in user's
 * name and email; a nav aside lists the account destinations (desktop
 * sidebar, mobile horizontal scroll) with the active link marked via
 * `aria-current`, plus the wishlist link and a sign-out action. `children`
 * render in the main column.
 *
 * No hydration gating any more: the identity arrives as a server-rendered
 * prop rather than from a persisted client store, so the first paint is
 * already correct and there is no server/client mismatch to avoid.
 */
export function AccountShell({ user, children }: AccountShellProps) {
  const pathname = usePathname()

  return (
    <Container className="flex flex-col gap-8 py-12 sm:py-16">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-semibold text-foreground">Your account</h1>
        {user ? (
          <p className="text-sm text-muted-foreground">
            {user.name ? `${user.name} · ` : ''}
            {user.email}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
        <aside className="w-full lg:w-56 lg:shrink-0">
          <nav
            aria-label="Account"
            className="flex gap-2 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible lg:pb-0"
          >
            {NAV_LINKS.map((link) => {
              const active = pathname === link.href
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    LINK_BASE,
                    active ? 'bg-accent text-accent-foreground' : LINK_INACTIVE,
                  )}
                >
                  {link.label}
                </Link>
              )
            })}
          </nav>

          {/*
            Outside the account nav, and with no `aria-current`, because this
            destination leaves the dashboard — see WISHLIST_LINK. Kept in the
            same aside (and given the same inactive styling) so the sidebar
            still reads as one column visually.
          */}
          <div className="mt-2 flex border-t border-border pt-2 lg:mt-3 lg:pt-3">
            <Link href={WISHLIST_LINK.href} className={cn(LINK_BASE, LINK_INACTIVE)}>
              {WISHLIST_LINK.label}
            </Link>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-4 w-full lg:w-auto"
            onClick={handleSignOut}
          >
            Sign out
          </Button>
        </aside>

        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </Container>
  )
}
