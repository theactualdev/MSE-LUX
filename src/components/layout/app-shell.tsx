import type { ReactNode } from 'react'
import { AnnouncementBar } from '@/components/brand/announcement-bar'
import { CurrencyProvider } from '@/features/currency/context'
import { Toaster } from '@/components/providers/toaster'
import { Footer } from '@/components/layout/footer'
import { Header } from '@/components/layout/header'
import { MobileDrawer } from '@/components/layout/mobile-drawer'
import { MiniCartDrawer } from '@/features/cart/components/mini-cart-drawer'
import { CartSync } from '@/features/cart/cart-sync'
import { SearchOverlay } from '@/features/catalog/components/search-overlay'
import { getAllCategories } from '@/features/catalog/server/selectors'
import { buildNav } from '@/lib/nav'

interface AppShellProps {
  children: ReactNode
}

/**
 * Global chrome wrapping every page: announcement bar, header, mobile drawer,
 * mini-cart drawer, guest->account cart/wishlist merge, search overlay, footer,
 * toast host.
 *
 * Async because navigation is now read from the database rather than a code
 * fixture, so a category created in the admin actually appears in the header.
 * `getAllCategories` is the same cached selector the home page already uses, so
 * this adds no query the storefront wasn't already making and does NOT change
 * any route's render class — `/` and the other static pages stay prerendered on
 * the existing hourly ISR window.
 */
export async function AppShell({ children }: AppShellProps) {
  const nav = buildNav(await getAllCategories())

  return (
    <CurrencyProvider>
      <Toaster>
        <div className="flex min-h-dvh flex-col">
          <AnnouncementBar />
          <Header nav={nav} />
          <MobileDrawer nav={nav} />
          <MiniCartDrawer />
          <CartSync />
          <SearchOverlay />
          <main className="flex-1">{children}</main>
          <Footer nav={nav} />
        </div>
      </Toaster>
    </CurrencyProvider>
  )
}
