import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { SectionHeading } from '@/components/brand/section-heading'
import { AccountShell } from '@/features/account/components/account-shell'
import { RequireAuth } from '@/features/account/components/require-auth'
import { CartSummary } from '@/features/cart/components/cart-summary'
import { getMockOrder } from '@/features/account/data/orders'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'

interface OrderDetailPageProps {
  params: Promise<{ orderNumber: string }>
}

export async function generateMetadata({ params }: OrderDetailPageProps): Promise<Metadata> {
  const { orderNumber } = await params
  return {
    title: 'Order details',
    description: `Details for order ${orderNumber}.`,
  }
}

/**
 * `/account/orders/[orderNumber]` — historical order detail. Reuses the
 * address / shipping method / line-item / summary presentation from
 * `order-confirmation.tsx`, minus its post-purchase "thank you" framing,
 * since this view is for browsing a past order rather than confirming a new
 * one. Falls back to a graceful "not found" state for an unknown order
 * number.
 */
export default async function OrderDetailPage({ params }: OrderDetailPageProps) {
  const { orderNumber } = await params
  const order = getMockOrder(orderNumber)

  return (
    <RequireAuth>
      <AccountShell>
        {order ? (
          <div className="flex flex-col gap-8">
            <div className="flex flex-col gap-3">
              <Link href="/account/orders" className="text-sm text-muted-foreground hover:text-foreground">
                &larr; Back to orders
              </Link>
              <SectionHeading
                title={`Order ${order.orderNumber}`}
                subtitle={`Placed ${new Date(order.placedAt).toLocaleDateString('en-NG', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}`}
              />
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
                    <span className="font-display text-sm font-medium leading-snug text-foreground">
                      {line.name}
                    </span>
                    {line.variantLabel ? <p className="text-xs text-muted-foreground">{line.variantLabel}</p> : null}

                    <div className="mt-auto flex items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground">
                        {line.quantity} × {formatMoney(line.unitPrice, 'en-NG')}
                      </span>
                      <span className="text-sm font-medium text-foreground">
                        {formatMoney(line.lineTotal, 'en-NG')}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <CartSummary summary={order.summary} className="rounded-xl border border-border p-4" />
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <h1 className="font-display text-2xl font-semibold text-foreground sm:text-3xl">
              We couldn&apos;t find that order
            </h1>
            <p className="max-w-sm text-sm text-muted-foreground">
              {`Order ${orderNumber} doesn't match anything in your history. Double-check the link, or head back to your orders.`}
            </p>
            <Link href="/account/orders" className={cn(buttonVariants(), 'mt-3')}>
              Back to orders
            </Link>
          </div>
        )}
      </AccountShell>
    </RequireAuth>
  )
}
