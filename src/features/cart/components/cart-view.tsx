'use client'

import Link from 'next/link'
import { ShoppingBag } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { CartLineItem } from '@/features/cart/components/cart-line-item'
import { CartSummary } from '@/features/cart/components/cart-summary'
import { computeCartSummary } from '@/features/cart/lib/summary'
import { shippingMethods } from '@/features/cart/lib/shipping'
import { useCart } from '@/features/cart/use-cart'
import { useHydrated } from '@/features/cart/use-hydrated'
import { cn } from '@/lib/utils'

/**
 * Full `/cart` page body: editable line items plus an order summary.
 *
 * Gated on `useHydrated` — the server render (and the client's first paint,
 * before `useSyncExternalStore` reports hydration) always shows the neutral
 * skeleton below, matching the server markup exactly. Only once hydrated do
 * we read cart state via `useCart()`, so there is never a server/client
 * mismatch for the (always empty, on the server) cart. Also holds the
 * skeleton while `useCart().isLoading` — the hook's `lines` resolve
 * asynchronously, so gating on hydration alone would flash the empty state
 * first.
 */
export function CartView() {
  const hydrated = useHydrated()
  const { lines, setQty, remove, isLoading } = useCart()

  if (!hydrated || isLoading) {
    return (
      <div className="flex flex-col gap-10 lg:flex-row lg:items-start" aria-hidden="true">
        <div className="flex flex-1 flex-col divide-y divide-border">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="flex gap-4 py-6 first:pt-0">
              <Skeleton className="size-24 shrink-0 rounded-xl" />
              <div className="flex flex-1 flex-col justify-center gap-3">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-4 w-1/3" />
              </div>
            </div>
          ))}
        </div>
        <div className="w-full lg:w-80 lg:shrink-0">
          <Skeleton className="h-56 w-full rounded-xl" />
        </div>
      </div>
    )
  }

  const hasItems = lines.length > 0

  if (!hasItems) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <ShoppingBag aria-hidden="true" className="size-10 text-muted-foreground" />
        <h2 className="font-display text-xl font-medium text-foreground">Your bag is empty</h2>
        <p className="max-w-sm text-sm text-muted-foreground">
          Explore the collection to find something special.
        </p>
        <Link href="/" className={cn(buttonVariants(), 'mt-3')}>
          Continue shopping
        </Link>
      </div>
    )
  }

  const summary = computeCartSummary(lines, shippingMethods[0].amount)

  return (
    <div className="flex flex-col gap-10 lg:flex-row lg:items-start">
      <div className="flex flex-1 flex-col divide-y divide-border">
        {lines.map((line) => (
          <CartLineItem
            key={`${line.product.id}::${line.variant?.id ?? ''}`}
            line={line}
            editable
            className="py-6 first:pt-0"
            onQtyChange={(qty) => setQty(line.product.id, line.variant?.id, qty)}
            onRemove={() => remove(line.product.id, line.variant?.id)}
          />
        ))}
      </div>

      <div className="flex w-full flex-col gap-4 rounded-xl border border-border bg-card p-6 lg:w-80 lg:shrink-0">
        <CartSummary summary={summary} />
        <p className="text-xs text-muted-foreground">Shipping estimated at checkout</p>
        <Link href="/checkout" className={cn(buttonVariants(), 'w-full')}>
          Proceed to checkout
        </Link>
      </div>
    </div>
  )
}
