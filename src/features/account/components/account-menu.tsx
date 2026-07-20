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
  const { signedIn, loading } = useSession()

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
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleSignOut}>Sign out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
