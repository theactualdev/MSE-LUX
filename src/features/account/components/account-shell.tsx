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
  // believing the visitor is signed in after a real sign-out. Cleared
  // synchronously at click time (see the onClick below) and restored if the
  // server action reports the sign-out failed, rather than waiting for the
  // server action to settle — it settles by *rejecting* on success (a
  // server-action `redirect()` turns into a rejected client promise, not a
  // resolved one; confirmed empirically, see task-5-report.md "Fix pass
  // 3"), so a `.then(onFulfilled)` after the call never runs on success and
  // there is no later point at which to clear it instead.
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
              // RequireAuth guard's redirect won that race).
              //
              // The mock store is cleared *synchronously*, optimistically
              // assuming success, and restored only if the action resolves
              // with `{ error }` — the one outcome that genuinely resolves.
              // A successful `signOut()` never resolves on the client: its
              // `redirect('/')` makes Next.js reject this call's promise
              // with an internal NEXT_REDIRECT error instead (verified by
              // driving a scratch server action + redirect through the dev
              // server: `.then(onFulfilled)` never fired, `.catch()` did,
              // and the navigation happened either way). So there is no
              // "wait for success, then clear" hook available — clearing
              // eagerly and rolling back on a reported failure is the only
              // way to keep the store in sync with both outcomes.
              clearMockSession()
              void signOut()
                .then((result) => {
                  if (result?.error) {
                    // Supabase reported a real error — the session cookie is
                    // still live, so put the mock user back rather than
                    // presenting a signed-out UI over a signed-in session.
                    useAuthStore.setState({ user })
                  }
                })
                .catch(() => {
                  // Reached for the expected redirect-as-rejection above
                  // (already handled by Next's router; nothing to do) and
                  // for a genuine transport failure (offline, 500). Neither
                  // has an error-surfacing UI at this button, and a
                  // transport failure gives no reliable signal the session
                  // is still valid, so the store is left as the synchronous
                  // clear above left it rather than guessing.
                })
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
