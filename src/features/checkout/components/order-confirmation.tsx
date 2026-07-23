'use client'

import Image from 'next/image'
import Link from 'next/link'
import { CheckCircle2 } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { CartSummary } from '@/features/cart/components/cart-summary'
import { useHydrated } from '@/features/cart/use-hydrated'
import { useLastOrderStore } from '@/features/checkout/store'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'

interface OrderConfirmationProps {
  orderNumber: string
}

/**
 * `/order/[orderNumber]` body. Reads the last placed order from
 * `useLastOrderStore` (session-persisted), gated on `useHydrated` so the
 * server render and the client's first paint never disagree (avoids a
 * hydration mismatch / flash of the wrong state).
 *
 * Once hydrated: if the persisted order's number matches the routed
 * `orderNumber`, renders a branded thank-you with the shipping address,
 * itemized lines, and totals. Otherwise (direct visit, a stale link, or the
 * session storage having cleared) renders a graceful "not found" state
 * linking home.
 */
export function OrderConfirmation({ orderNumber }: OrderConfirmationProps) {
  const hydrated = useHydrated()
  const order = useLastOrderStore((s) => s.order)

  if (!hydrated) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-6 py-12 text-center" aria-hidden="true">
        <Skeleton className="h-10 w-10 rounded-full" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    )
  }

  if (order?.orderNumber !== orderNumber) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <h1 className="font-display text-2xl font-semibold text-foreground sm:text-3xl">
          We couldn&apos;t find that order
        </h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          {`Order ${orderNumber} doesn't match anything from this session. Double-check the link, or head back home.`}
        </p>
        <Link href="/" className={cn(buttonVariants(), 'mt-3')}>
          Back home
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8">
      <div className="flex flex-col items-center gap-3 text-center">
        <CheckCircle2 aria-hidden="true" className="size-10 text-primary" />
        <h1 className="font-display text-2xl font-semibold text-foreground sm:text-3xl">Thank you for your order</h1>
        <p className="text-sm text-muted-foreground">
          Order <span className="font-medium text-foreground">{order.orderNumber}</span> is confirmed. A receipt has
          been sent to <span className="font-medium text-foreground">{order.email}</span>.
        </p>
      </div>

      <div className="flex flex-col gap-1 rounded-xl border border-border p-4">
        <h2 className="text-sm font-medium text-foreground">Shipping address</h2>
        <div className="flex flex-col text-sm text-muted-foreground">
          <span className="text-foreground">{order.address.fullName}</span>
          <span>
            {order.address.line1}
            {order.address.line2 ? `, ${order.address.line2}` : ''}
          </span>
          <span>
            {order.address.city}, {order.address.state}, {order.address.country}
            {order.address.postalCode ? ` ${order.address.postalCode}` : ''}
          </span>
          <span>{order.address.phone}</span>
        </div>
      </div>

      <div className="flex items-center justify-between rounded-xl border border-border p-4">
        <h2 className="text-sm font-medium text-foreground">Shipping method</h2>
        <p className="text-sm text-muted-foreground">{order.shippingLabel}</p>
      </div>

      <div className="flex flex-col divide-y divide-border rounded-xl border border-border p-4">
        {order.lines.map((line, index) => (
          <div key={`${line.name}-${index}`} className="flex gap-4 py-4 first:pt-0 last:pb-0">
            <div className="relative size-16 shrink-0 overflow-hidden rounded-xl bg-muted">
              <Image src={line.image.src} alt={line.image.alt} fill sizes="96px" className="object-cover" />
            </div>

            <div className="flex flex-1 flex-col gap-1">
              <span className="font-display text-sm font-medium leading-snug text-foreground">{line.name}</span>
              {line.variantLabel ? <p className="text-xs text-muted-foreground">{line.variantLabel}</p> : null}

              <div className="mt-auto flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">
                  {line.quantity} × {formatMoney(line.unitPrice)}
                </span>
                <span className="text-sm font-medium text-foreground">{formatMoney(line.lineTotal)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <CartSummary summary={order.summary} className="rounded-xl border border-border p-4" />

      <Link href="/" className={cn(buttonVariants(), 'w-full')}>
        Continue shopping
      </Link>
    </div>
  )
}
