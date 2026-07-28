'use client'

import Image from 'next/image'
import Link from 'next/link'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { CartSummary } from '@/features/cart/components/cart-summary'
import { useHydrated } from '@/features/cart/use-hydrated'
import { useLastOrderStore } from '@/features/checkout/store'
import type { Order } from '@/features/checkout/lib/place-order'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'

interface OrderConfirmationProps {
  orderNumber: string
  /**
   * The signed-in owner's order, read from the DB by the server component
   * (`getOrder`, scoped to the session user). When present it renders
   * immediately — no hydration gate needed, since it's identical on the
   * server render and the first client paint. Absent for a guest, an
   * unauthenticated visitor, or a not-owned order, in which case we fall
   * back to the session snapshot exactly as before.
   */
  initialOrder?: Order
  /**
   * Whether `verifyPayment`'s fast path actually finished fulfilling this
   * order (`'paid'`) or hit an unexpected error and is relying on the
   * webhook backstop (`'processing'`, Phase 6 finding B). Threaded down from
   * the page's `?status=` query flag that `checkout-flow.tsx` appends on
   * navigation — deliberately NOT inferred from `initialOrder`/the session
   * snapshot, since neither `Order` shape carries a `paidAt`/fulfilment
   * status to gate on. Defaults to `'paid'` so every other entry point
   * (a reload, a direct link, an owner revisiting from `/account/orders`)
   * keeps rendering the normal confirmed state.
   */
  paymentStatus?: 'paid' | 'processing'
}

/**
 * `/order/[orderNumber]` body.
 *
 * A signed-in owner's order comes from `initialOrder` (server-provided DB
 * read) and renders straight away. Otherwise this falls back to the last
 * placed order from `useLastOrderStore` (session-persisted), gated on
 * `useHydrated` so the server render and the client's first paint never
 * disagree (avoids a hydration mismatch / flash of the wrong state).
 *
 * A guest order is deliberately never fetched from the DB by raw order
 * number here — only ever shown from the session snapshot checkout just
 * wrote — so guest orders can't be enumerated by guessing a number.
 *
 * Once resolved: if the order's number matches the routed `orderNumber`,
 * renders a branded thank-you with the shipping address, itemized lines,
 * and totals. Otherwise (direct visit, a stale link, or the session storage
 * having cleared) renders a graceful "not found" state linking home.
 */
export function OrderConfirmation({ orderNumber, initialOrder, paymentStatus = 'paid' }: OrderConfirmationProps) {
  const hydrated = useHydrated()
  const snapshot = useLastOrderStore((s) => s.order)

  if (initialOrder) {
    return renderConfirmation(initialOrder, paymentStatus)
  }

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

  if (snapshot?.orderNumber !== orderNumber) {
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

  return renderConfirmation(snapshot, paymentStatus)
}

function renderConfirmation(order: Order, paymentStatus: 'paid' | 'processing' = 'paid') {
  const isProcessing = paymentStatus === 'processing'

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8">
      <div className="flex flex-col items-center gap-3 text-center">
        {isProcessing ? (
          <Loader2 aria-hidden="true" className="size-10 animate-spin text-primary" />
        ) : (
          <CheckCircle2 aria-hidden="true" className="size-10 text-primary" />
        )}
        {isProcessing ? (
          <>
            <h1 className="font-display text-2xl font-semibold text-foreground sm:text-3xl">
              Payment received — we&apos;re finalising your order
            </h1>
            <p className="text-sm text-muted-foreground">
              Order <span className="font-medium text-foreground">{order.orderNumber}</span> is paid and being
              processed. We&apos;ll email <span className="font-medium text-foreground">{order.email}</span> as soon
              as it&apos;s confirmed.
            </p>
          </>
        ) : (
          <>
            <h1 className="font-display text-2xl font-semibold text-foreground sm:text-3xl">Thank you for your order</h1>
            <p className="text-sm text-muted-foreground">
              Order <span className="font-medium text-foreground">{order.orderNumber}</span> is confirmed. A receipt
              has been sent to <span className="font-medium text-foreground">{order.email}</span>.
            </p>
          </>
        )}
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
