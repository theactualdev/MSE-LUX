'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import {
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuTrigger,
} from '@/components/ui/navigation-menu'
import { usePrefersReducedMotion } from '@/hooks/use-reduced-motion'
import type { NavItem } from '@/types/nav'

interface MegaMenuProps {
  item: NavItem & { children: NavItem[] }
}

/**
 * Desktop dropdown panel for a nav item that has children. Reveals on
 * hover/focus of its `NavigationMenuTrigger` (handled by the underlying
 * `NavigationMenu` primitive) and animates its entrance with Framer Motion,
 * skipping the animation entirely when the user prefers reduced motion.
 */
export function MegaMenu({ item }: MegaMenuProps) {
  const prefersReducedMotion = usePrefersReducedMotion()

  return (
    <NavigationMenuItem>
      <NavigationMenuTrigger>{item.label}</NavigationMenuTrigger>
      <NavigationMenuContent>
        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.18, ease: 'easeOut' }}
          className="grid w-[min(90vw,28rem)] grid-cols-2 gap-x-8 gap-y-1 p-6 sm:w-[32rem]"
        >
          <div className="col-span-2 pb-2">
            <NavigationMenuLink
              render={<Link href={item.href} />}
              className="font-display text-base font-medium text-foreground"
            >
              Shop all {item.label}
            </NavigationMenuLink>
          </div>
          {item.children.map((child) => (
            <NavigationMenuLink
              key={child.href}
              render={<Link href={child.href} />}
              className="text-sm text-muted-foreground"
            >
              {child.label}
            </NavigationMenuLink>
          ))}
        </motion.div>
      </NavigationMenuContent>
    </NavigationMenuItem>
  )
}
