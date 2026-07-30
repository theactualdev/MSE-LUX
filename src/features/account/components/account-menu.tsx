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
import { handleSignOut } from '@/features/auth/sign-out'
import { useSession } from '@/features/auth/use-session'
import { roleSatisfies } from '@/features/auth/role'
import { Role } from '@/generated/prisma/enums'
import { cn } from '@/lib/utils'

/**
 * Header account affordance. While the session read is settling (so the
 * server-rendered markup matches the client's initial render) it shows an
 * inert placeholder icon button. Once settled: a signed-out visitor sees a
 * link to `/login`; a signed-in user gets a dropdown with account navigation
 * and sign-out.
 *
 * `useSession` is UX only — it reads a browser cookie, so it decides what to
 * *render*, never what to *permit*. Every destination below is enforced
 * server-side by `requireUser()`, so a tampered cookie buys nothing more than
 * a dropdown whose links all bounce to `/login`.
 */
export function AccountMenu() {
  const { signedIn, role, loading } = useSession()
  const showAdminLink = roleSatisfies(role, Role.ADMIN)

  if (loading) {
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

  if (!signedIn) {
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
        {/* Hidden from customers on purpose: `/admin` `notFound()`s rather than
            403s, so an unconditional item would advertise an area that is
            deliberately concealed. Rendering only — a forged role claim shows
            this link and still can't open the page (see `useSession`). */}
        {/* Two sibling conditionals rather than one fragment: Base UI walks
            DropdownMenuContent's children to register items, and a fragment
            wrapper hides them from that traversal — the item renders but is
            never registered, so it isn't reachable as a `menuitem`. */}
        {showAdminLink ? <DropdownMenuSeparator /> : null}
        {showAdminLink ? (
          <DropdownMenuItem render={<Link href="/admin" />}>Admin</DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleSignOut}>Sign out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
