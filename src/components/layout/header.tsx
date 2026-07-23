'use client'

import Link from 'next/link'
import { Heart, Menu, Search, ShoppingBag } from 'lucide-react'
import { Container } from '@/components/brand/container'
import { Logo } from '@/components/brand/logo'
import { MegaMenu } from '@/components/layout/mega-menu'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { NavigationMenu, NavigationMenuItem, NavigationMenuLink, NavigationMenuList } from '@/components/ui/navigation-menu'
import { AccountMenu } from '@/features/account/components/account-menu'
import { useCart } from '@/features/cart/use-cart'
import { useHydrated } from '@/features/cart/use-hydrated'
import { CurrencySwitcher } from '@/features/currency/components/currency-switcher'
import { useWishlistStore } from '@/features/wishlist/store'
import { siteConfig } from '@/lib/config'
import { useUiStore } from '@/stores/ui'
import { cn } from '@/lib/utils'
import type { NavItem } from '@/types/nav'

function hasChildren(item: NavItem): item is NavItem & { children: NavItem[] } {
  return Boolean(item.children && item.children.length > 0)
}

/** Sticky top bar: brand mark, desktop primary nav, and account/search/cart actions. */
export function Header() {
  const openMobileNav = useUiStore((s) => s.openMobileNav)
  const toggleSearch = useUiStore((s) => s.toggleSearch)
  const openCartDrawer = useUiStore((s) => s.openCartDrawer)
  const { itemCount: cartCount } = useCart()
  const wishlistCount = useWishlistStore((s) => s.count())
  const hydrated = useHydrated()
  const showCartBadge = hydrated && cartCount > 0
  const showWishlistBadge = hydrated && wishlistCount > 0

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-background shadow-sm">
      <Container className="flex h-16 items-center justify-between gap-2 sm:h-20">
        <Button
          type="button"
          variant="ghost"
          size="icon-xl"
          aria-label="Open menu"
          className="md:hidden"
          onClick={() => openMobileNav()}
        >
          <Menu aria-hidden="true" />
        </Button>

        <Logo />

        <NavigationMenu className="hidden md:flex">
          <NavigationMenuList>
            {siteConfig.nav.map((item) =>
              hasChildren(item) ? (
                <MegaMenu key={item.href} item={item} />
              ) : (
                <NavigationMenuItem key={item.href}>
                  <NavigationMenuLink render={<Link href={item.href} />}>{item.label}</NavigationMenuLink>
                </NavigationMenuItem>
              ),
            )}
          </NavigationMenuList>
        </NavigationMenu>

        <div className="flex items-center gap-1">
          <CurrencySwitcher />
          <Button type="button" variant="ghost" size="icon-xl" aria-label="Search" onClick={() => toggleSearch()}>
            <Search aria-hidden="true" />
          </Button>
          <Link
            href="/wishlist"
            aria-label={showWishlistBadge ? `Wishlist, ${wishlistCount} items` : 'Wishlist'}
            className={cn(buttonVariants({ variant: 'ghost', size: 'icon-xl' }), 'relative hidden sm:inline-flex')}
          >
            <Heart aria-hidden="true" />
            <Badge className={cn('absolute -top-1 -right-1', !showWishlistBadge && 'hidden')} aria-hidden="true">
              {showWishlistBadge ? wishlistCount : null}
            </Badge>
          </Link>
          <AccountMenu />
          <Button
            type="button"
            variant="ghost"
            size="icon-xl"
            aria-label={showCartBadge ? `Cart, ${cartCount} items` : 'Cart'}
            className="relative"
            onClick={() => openCartDrawer()}
          >
            <ShoppingBag aria-hidden="true" />
            <Badge className={cn('absolute -top-1 -right-1', !showCartBadge && 'hidden')} aria-hidden="true">
              {showCartBadge ? cartCount : null}
            </Badge>
          </Button>
        </div>
      </Container>
    </header>
  )
}
