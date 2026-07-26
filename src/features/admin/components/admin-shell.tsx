'use client'

import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { handleSignOut } from '@/features/auth/sign-out'
import { siteConfig } from '@/lib/config'
import { cn } from '@/lib/utils'

/**
 * Admin nav: Dashboard, Orders, and Catalog are live; the remaining 8d
 * section is visible but inert so the shell reads complete and the coming
 * slot is obvious. Inert items are plain text (not links) — nothing for a
 * keyboard/screen-reader user to activate.
 */
const NAV_ITEMS: Array<{ label: string; href?: string }> = [
  { label: 'Dashboard', href: '/admin' },
  { label: 'Orders', href: '/admin/orders' },
  { label: 'Catalog', href: '/admin/catalog' },
  { label: 'Customers' },
]

/**
 * A nav item is active on an exact pathname match, or — for anything besides
 * the `/admin` dashboard root — on any nested route below it too (so
 * `/admin/orders/MSE-1` still highlights `Orders`). `/admin` itself must stay
 * exact-only, or it would light up for every admin route.
 */
function isNavItemActive(pathname: string, href: string): boolean {
  if (href === '/admin') return pathname === href
  return pathname === href || pathname.startsWith(href + '/')
}

/**
 * Utilitarian admin chrome: slim top bar (store name, admin email, sign-out)
 * and a left sidebar nav — dense and neutral, deliberately NOT the storefront
 * marketing chrome. Desktop-primary; on mobile the sidebar collapses behind a
 * top-bar toggle.
 */
export function AdminShell({ email, children }: { email: string | null; children: ReactNode }) {
  const pathname = usePathname()
  const [navOpen, setNavOpen] = useState(false)

  const nav = (
    <nav aria-label="Admin" className="flex flex-col gap-1 p-4">
      {NAV_ITEMS.map((item) => {
        const active = item.href ? isNavItemActive(pathname ?? '', item.href) : false
        return item.href ? (
          <Link
            key={item.label}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              active
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
            onClick={() => setNavOpen(false)}
          >
            {item.label}
          </Link>
        ) : (
          <span
            key={item.label}
            className="flex items-baseline justify-between rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground/70"
          >
            {item.label}
            <span className="text-[10px] font-normal uppercase tracking-wide">Coming soon</span>
          </span>
        )
      })}
    </nav>
  )

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="flex h-14 items-center justify-between gap-3 border-b border-border px-4 lg:px-6">
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="lg:hidden"
            aria-expanded={navOpen}
            aria-label={navOpen ? 'Close menu' : 'Open menu'}
            onClick={() => setNavOpen((open) => !open)}
          >
            {navOpen ? <X aria-hidden="true" className="size-5" /> : <Menu aria-hidden="true" className="size-5" />}
          </Button>
          <Link href="/admin" className="text-sm font-semibold tracking-wide text-foreground">
            {siteConfig.name} <span className="font-normal text-muted-foreground">Admin</span>
          </Link>
        </div>
        <div className="flex items-center gap-3">
          {email ? <span className="hidden text-sm text-muted-foreground sm:inline">{email}</span> : null}
          <Button type="button" variant="outline" size="sm" onClick={handleSignOut}>
            Sign out
          </Button>
        </div>
      </header>

      {navOpen ? <div className="border-b border-border lg:hidden">{nav}</div> : null}

      <div className="flex flex-1">
        <aside className="hidden w-56 shrink-0 border-r border-border lg:block">{nav}</aside>
        <main className="min-w-0 flex-1 p-4 lg:p-8">{children}</main>
      </div>
    </div>
  )
}
