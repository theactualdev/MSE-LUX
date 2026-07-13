'use client'

import Link from 'next/link'
import { Heart, Menu, Search, ShoppingBag, User } from 'lucide-react'
import { Container } from '@/components/brand/container'
import { Logo } from '@/components/brand/logo'
import { MegaMenu } from '@/components/layout/mega-menu'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { NavigationMenu, NavigationMenuItem, NavigationMenuLink, NavigationMenuList } from '@/components/ui/navigation-menu'
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

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80">
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
          <Button type="button" variant="ghost" size="icon-xl" aria-label="Search" onClick={() => toggleSearch()}>
            <Search aria-hidden="true" />
          </Button>
          <Link
            href="/wishlist"
            aria-label="Wishlist"
            className={cn(buttonVariants({ variant: 'ghost', size: 'icon-xl' }), 'relative hidden sm:inline-flex')}
          >
            <Heart aria-hidden="true" />
            <Badge className="absolute -top-1 -right-1 hidden" aria-hidden="true" />
          </Link>
          <Link
            href="/account"
            aria-label="Account"
            className={cn(buttonVariants({ variant: 'ghost', size: 'icon-xl' }), 'hidden sm:inline-flex')}
          >
            <User aria-hidden="true" />
          </Link>
          <Link
            href="/cart"
            aria-label="Cart"
            className={cn(buttonVariants({ variant: 'ghost', size: 'icon-xl' }), 'relative')}
          >
            <ShoppingBag aria-hidden="true" />
            <Badge className="absolute -top-1 -right-1 hidden" aria-hidden="true" />
          </Link>
        </div>
      </Container>
    </header>
  )
}
