'use client'

import Link from 'next/link'
import { ShoppingBag } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { CartLineItem } from '@/features/cart/components/cart-line-item'
import { useCart } from '@/features/cart/use-cart'
import { useHydrated } from '@/features/cart/use-hydrated'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'
import { useUiStore } from '@/stores/ui'

/**
 * Slide-over cart summary opened after adding an item and via the header
 * cart icon. Lists current lines with inline qty/remove controls, a
 * subtotal, and links into the full cart and checkout — both close the
 * drawer first so the destination page renders fresh.
 */
export function MiniCartDrawer() {
  const open = useUiStore((s) => s.cartDrawerOpen)
  const closeCartDrawer = useUiStore((s) => s.closeCartDrawer)
  const { lines, isLoading } = useCart()
  const hydrated = useHydrated()

  // Before hydration: render nothing (SSR/first-paint gate, matches the server
  // markup). Once hydrated but while `isLoading` (server items and/or line
  // resolution still in flight): show a skeleton, not a blank drawer (which
  // reads as "broken") and not the empty state (which would be a false flash).
  const showContent = hydrated && !isLoading
  const hasItems = lines.length > 0
  const subtotalAmountMinor = lines.reduce((sum, line) => sum + line.lineTotal.amountMinor, 0)

  return (
    <Sheet
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) closeCartDrawer()
      }}
    >
      <SheetContent className="flex w-4/5 max-w-sm flex-col">
        <SheetHeader>
          <SheetTitle>Your bag</SheetTitle>
        </SheetHeader>

        {!hydrated ? null : isLoading ? (
          <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-4" aria-hidden="true">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex gap-4">
                <Skeleton className="size-16 shrink-0 rounded-lg" />
                <div className="flex flex-1 flex-col justify-center gap-2">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-4 w-1/3" />
                </div>
              </div>
            ))}
          </div>
        ) : hasItems ? (
          <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-4">
            {lines.map((line) => (
              // Compact summary rows (thumbnail, name, qty × price, line total) — no
              // stepper/remove: those don't fit a narrow mobile drawer and the full
              // editable controls live on the /cart page ("View cart" below).
              <CartLineItem key={`${line.product.id}::${line.variant?.id ?? ''}`} line={line} />
            ))}
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 text-center">
            <ShoppingBag aria-hidden="true" className="size-8 text-muted-foreground" />
            <p className="font-display text-lg text-foreground">Your bag is empty</p>
            <p className="text-sm text-muted-foreground">Explore the collection to find something special.</p>
          </div>
        )}

        {showContent && hasItems ? (
          <SheetFooter>
            <div className="flex items-center justify-between text-base font-medium text-foreground">
              <span>Subtotal</span>
              <span>{formatMoney({ amountMinor: subtotalAmountMinor, currency: 'NGN' })}</span>
            </div>
            <Link
              href="/cart"
              onClick={closeCartDrawer}
              className={cn(buttonVariants({ variant: 'outline' }), 'w-full')}
            >
              View cart
            </Link>
            <Link href="/checkout" onClick={closeCartDrawer} className={cn(buttonVariants(), 'w-full')}>
              Checkout
            </Link>
          </SheetFooter>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}
