import type { ReactNode } from 'react'
import { AnnouncementBar } from '@/components/brand/announcement-bar'
import { Toaster } from '@/components/providers/toaster'
import { Footer } from '@/components/layout/footer'
import { Header } from '@/components/layout/header'
import { MobileDrawer } from '@/components/layout/mobile-drawer'
import { MiniCartDrawer } from '@/features/cart/components/mini-cart-drawer'
import { SearchOverlay } from '@/features/catalog/components/search-overlay'

interface AppShellProps {
  children: ReactNode
}

/** Global chrome wrapping every page: announcement bar, header, mobile drawer, mini-cart drawer, search overlay, footer, toast host. */
export function AppShell({ children }: AppShellProps) {
  return (
    <Toaster>
      <div className="flex min-h-dvh flex-col">
        <AnnouncementBar />
        <Header />
        <MobileDrawer />
        <MiniCartDrawer />
        <SearchOverlay />
        <main className="flex-1">{children}</main>
        <Footer />
      </div>
    </Toaster>
  )
}
