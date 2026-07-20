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
  // believing the visitor is signed in after a real sign-out. Cleared
  // synchronously at click time (see the onClick below) and restored if the
  // server action reports the sign-out failed, rather than waiting for the
  // server action to settle — it settles by *rejecting* on success (a
  // server-action `redirect()` turns into a rejected client promise, not a
  // resolved one; confirmed empirically, see task-5-report.md "Fix pass
  // 3"), so a `.then(onFulfilled)` after the call never runs on success and
  // there is no later point at which to clear it instead.
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
            // RequireAuth guard's redirect won that race).
            //
            // The mock store is cleared *synchronously*, optimistically
            // assuming success, and restored only if the action resolves
            // with `{ error }` — the one outcome that genuinely resolves. A
            // successful `signOut()` never resolves on the client: its
            // `redirect('/')` makes Next.js reject this call's promise with
            // an internal NEXT_REDIRECT error instead (verified by driving a
            // scratch server action + redirect through the dev server:
            // `.then(onFulfilled)` never fired, `.catch()` did, and the
            // navigation happened either way). So there is no "wait for
            // success, then clear" hook available — clearing eagerly and
            // rolling back on a reported failure is the only way to keep the
            // store in sync with both outcomes.
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
                // (already handled by Next's router; nothing to do) and for
                // a genuine transport failure (offline, 500). Neither has an
                // error-surfacing UI at this item, and a transport failure
                // gives no reliable signal the session is still valid, so
                // the store is left as the synchronous clear above left it
                // rather than guessing.
              })
          }}
        >
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
