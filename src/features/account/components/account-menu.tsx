'use client'

import Link from 'next/link'
import { User } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { signOut } from '@/features/auth/actions'
import { useAuthStore } from '@/features/account/store'
import { useHydrated } from '@/features/cart/use-hydrated'
import { cn } from '@/lib/utils'

/**
 * Header account affordance. Before hydration (so the server-rendered markup
 * matches the client's initial render regardless of persisted auth state) it
 * shows an inert placeholder icon button. Once hydrated: a signed-out
 * visitor sees a link to `/login`; a signed-in user gets a dropdown with
 * account navigation and sign-out.
 */
export function AccountMenu() {
  const hydrated = useHydrated()
  const user = useAuthStore((s) => s.user)
  // Transitional: the mock store's `signOut` still owns `user` in
  // localStorage until Task 8 retires the store. Without clearing it here,
  // the stale mock `user` would keep this menu (and `RedirectIfAuthed`)
  // believing the visitor is signed in after a real sign-out. Cleared only
  // *after* the server action settles (see the onClick below) so it can't
  // race `RequireAuth`'s redirect.
  const clearMockSession = useAuthStore((s) => s.signOut)

  if (!hydrated) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="icon-xl"
        aria-hidden="true"
        tabIndex={-1}
        className="hidden sm:inline-flex"
      >
        <User aria-hidden="true" />
      </Button>
    )
  }

  if (!user) {
    return (
      <Link
        href="/login"
        aria-label="Sign in"
        className={cn(buttonVariants({ variant: 'ghost', size: 'icon-xl' }), 'hidden sm:inline-flex')}
      >
        <User aria-hidden="true" />
      </Link>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-xl"
            aria-label="Account menu"
            className="hidden sm:inline-flex"
          >
            <User aria-hidden="true" />
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        <DropdownMenuItem render={<Link href="/account" />}>Profile</DropdownMenuItem>
        <DropdownMenuItem render={<Link href="/account/orders" />}>Orders</DropdownMenuItem>
        <DropdownMenuItem render={<Link href="/account/addresses" />}>Addresses</DropdownMenuItem>
        <DropdownMenuItem render={<Link href="/wishlist" />}>Wishlist</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => {
            // signOut() redirects to `/` itself on success — no client-side
            // push here, or the two navigations would race (see Phase 2d
            // follow-up: sign-out used to land on /login because the
            // RequireAuth guard's redirect won that race). Clearing the mock
            // store must wait until *after* the server action resolves: on
            // an /account* page this menu renders inside RequireAuth, and
            // nulling `user` synchronously (before the server round-trip)
            // reintroduces that exact race — RequireAuth's effect fires
            // router.replace('/login') long before redirect('/') lands. On
            // success redirect() unmounts everything before this ever runs;
            // on failure it correctly leaves the store in sync with the
            // still-live session.
            void signOut().then(() => clearMockSession())
          }}
        >
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
