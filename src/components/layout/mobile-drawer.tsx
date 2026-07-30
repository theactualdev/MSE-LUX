'use client'

import Link from 'next/link'
import { ChevronDown, LayoutDashboard, LogIn, Search } from 'lucide-react'
import { Separator } from '@/components/ui/separator'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { siteConfig } from '@/lib/config'
import { useUiStore } from '@/stores/ui'
import { useSession } from '@/features/auth/use-session'
import { roleSatisfies } from '@/features/auth/role'
import { Role } from '@/generated/prisma/enums'

/**
 * Mobile navigation drawer. Its open state is bound directly to
 * `useUiStore`'s `mobileNavOpen`, so the hamburger button (in `Header`) and
 * any programmatic close both drive the same source of truth.
 */
export function MobileDrawer() {
  const open = useUiStore((s) => s.mobileNavOpen)
  const closeMobileNav = useUiStore((s) => s.closeMobileNav)
  // `AccountMenu` — which carries the desktop Admin link — is `hidden sm:*`, so
  // without this an admin on a phone has no route to the dashboard but typing
  // the URL. Same rules as there: hidden from customers because `/admin`
  // `notFound()`s rather than 403s, and rendering only — the layout gate and
  // every admin action re-check the role against a verified JWT.
  //
  // `signedIn` is checked as well as the role: `AccountMenu` returns early for
  // a signed-out visitor so its admin item is unreachable, but this drawer has
  // no such branch, so the pairing has to be explicit here.
  const { signedIn, role } = useSession()
  const showAdminLink = signedIn && roleSatisfies(role, Role.ADMIN)

  return (
    <Sheet
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) closeMobileNav()
      }}
    >
      <SheetContent side="left" className="w-4/5 max-w-sm overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="sr-only">Menu</SheetTitle>
        </SheetHeader>

        <nav aria-label="Mobile" className="flex flex-col px-4">
          {siteConfig.nav.map((item) =>
            item.children && item.children.length > 0 ? (
              <details key={item.href} className="group border-b border-border py-1">
                <summary className="flex cursor-pointer list-none items-center justify-between py-2 text-base font-medium text-foreground">
                  {item.label}
                  <ChevronDown
                    className="size-4 text-muted-foreground transition-transform group-open:rotate-180"
                    aria-hidden="true"
                  />
                </summary>
                <div className="flex flex-col gap-1 pb-2 pl-4">
                  <Link href={item.href} onClick={closeMobileNav} className="py-1.5 text-sm text-muted-foreground">
                    Shop all {item.label}
                  </Link>
                  {item.children.map((child) => (
                    <Link
                      key={child.href}
                      href={child.href}
                      onClick={closeMobileNav}
                      className="py-1.5 text-sm text-muted-foreground"
                    >
                      {child.label}
                    </Link>
                  ))}
                </div>
              </details>
            ) : (
              <Link
                key={item.href}
                href={item.href}
                onClick={closeMobileNav}
                className="border-b border-border py-3 text-base font-medium text-foreground"
              >
                {item.label}
              </Link>
            ),
          )}
        </nav>

        <Separator className="my-2" />

        <div className="flex flex-col px-4 pb-4">
          <Link href="/search" onClick={closeMobileNav} className="flex items-center gap-2 py-3 text-sm text-foreground">
            <Search className="size-4" aria-hidden="true" />
            Search
          </Link>
          <Link
            href="/account"
            onClick={closeMobileNav}
            className="flex items-center gap-2 py-3 text-sm text-foreground"
          >
            <LogIn className="size-4" aria-hidden="true" />
            Account
          </Link>
          {showAdminLink ? (
            <Link
              href="/admin"
              onClick={closeMobileNav}
              className="flex items-center gap-2 py-3 text-sm text-foreground"
            >
              <LayoutDashboard className="size-4" aria-hidden="true" />
              Admin
            </Link>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  )
}
