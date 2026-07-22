'use client'

import Link from 'next/link'
import { ShoppingBag } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { CartLineItem } from '@/features/cart/components/cart-line-item'
import { getCartLines } from '@/features/cart/lib/lines'
import { useCartStore } from '@/features/cart/store'
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
  const items = useCartStore((s) => s.items)
  const hydrated = useHydrated()

  const lines = hydrated ? getCartLines(items, 'NGN') : []
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

        {!hydrated ? null : hasItems ? (
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

        {hydrated && hasItems ? (
          <SheetFooter>
            <div className="flex items-center justify-between text-base font-medium text-foreground">
              <span>Subtotal</span>
              <span>{formatMoney({ amountMinor: subtotalAmountMinor, currency: 'NGN' }, 'en-NG')}</span>
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
