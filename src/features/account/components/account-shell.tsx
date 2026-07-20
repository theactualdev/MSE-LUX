'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Container } from '@/components/brand/container'
import { signOut } from '@/features/auth/actions'
import { useAuthStore } from '@/features/account/store'
import { useHydrated } from '@/features/cart/use-hydrated'
import { cn } from '@/lib/utils'

interface AccountShellProps {
  children: ReactNode
}

const NAV_LINKS = [
  { href: '/account', label: 'Profile' },
  { href: '/account/orders', label: 'Orders' },
  { href: '/account/addresses', label: 'Addresses' },
  { href: '/wishlist', label: 'Wishlist' },
]

/**
 * Two-column account dashboard shell. A header shows the signed-in user's
 * name and email (gated on hydration to avoid a server/client flash); a nav
 * aside lists account destinations (desktop sidebar, mobile horizontal
 * scroll) with the active link marked via `aria-current`, plus a sign-out
 * action. `children` render in the main column.
 */
export function AccountShell({ children }: AccountShellProps) {
  const hydrated = useHydrated()
  const user = useAuthStore((s) => s.user)
  const pathname = usePathname()
  // Transitional: the mock store's `signOut` still owns `user` in
  // localStorage until Task 8 retires the store. Without clearing it here,
  // the stale mock `user` would keep this shell (and `RedirectIfAuthed`)
  // believing the visitor is signed in after a real sign-out. Cleared only
  // *after* the server action settles (see the onClick below) so it can't
  // race `RequireAuth`'s redirect.
  const clearMockSession = useAuthStore((s) => s.signOut)

  return (
    <Container className="flex flex-col gap-8 py-12 sm:py-16">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-semibold text-foreground">Your account</h1>
        {hydrated && user ? (
          <p className="text-sm text-muted-foreground">
            {user.name} &middot; {user.email}
          </p>
        ) : (
          <div aria-hidden className="h-5 w-48 animate-pulse rounded bg-muted" />
        )}
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
                    'shrink-0 rounded-lg px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors',
                    active
                      ? 'bg-accent text-accent-foreground'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  {link.label}
                </Link>
              )
            })}
          </nav>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-4 w-full lg:w-auto"
            onClick={() => {
              // signOut() redirects to `/` itself on success — no client-side
              // push here, or the two navigations would race (see Phase 2d
              // follow-up: sign-out used to land on /login because the
              // RequireAuth guard's redirect won that race). Clearing the
              // mock store must wait until *after* the server action
              // resolves: this component renders inside RequireAuth, and
              // nulling `user` synchronously (before the server round-trip)
              // reintroduces that exact race — RequireAuth's effect fires
              // router.replace('/login') long before redirect('/') lands.
              // On success redirect() unmounts everything before this ever
              // runs; on failure it correctly leaves the store in sync with
              // the still-live session.
              void signOut().then(() => clearMockSession())
            }}
          >
            Sign out
          </Button>
        </aside>

        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </Container>
  )
}
