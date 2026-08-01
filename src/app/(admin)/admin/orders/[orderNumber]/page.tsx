import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getAdminOrder } from '@/features/admin/orders/data'
import { StatusBadge } from '@/features/admin/orders/components/status-badge'
import { OrderActions } from '@/features/admin/orders/components/order-actions'
import { CartSummary } from '@/features/cart/components/cart-summary'
import { Badge } from '@/components/ui/badge'
import { formatMoney } from '@/lib/money/format'

interface OrderDetailPageProps {
  params: Promise<{ orderNumber: string }>
}

/**
 * DUPLICATED from `@/features/admin/orders/booking.ts` (which itself
 * duplicates `@/features/checkout/shipping.ts`'s copy for the same
 * `'use server'`-export-constraint reason) — this file needs it purely to
 * decide whether to render the booking action, no `'use server'` involved,
 * but a fourth copy is simpler than reaching across the export boundary.
 * Tracked with the other two for extraction into a shared helper module.
 */
function isNigeria(country: string): boolean {
  const normalized = country.trim().toLowerCase()
  return normalized === 'nigeria' || normalized === 'ng'
}

export async function generateMetadata({ params }: OrderDetailPageProps): Promise<Metadata> {
  const { orderNumber } = await params
  return { title: `Order ${orderNumber}` }
}

/** Formats an ISO timestamp for the admin fulfilment timeline. */
function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString('en-NG')
}

/**
 * `/admin/orders/[orderNumber]` — full order detail for ops: fulfilment
 * timeline, address/payment/line-item presentation (mirroring the customer
 * `/account/orders/[orderNumber]` page's layout idioms), and the
 * status-appropriate `OrderActions` panel. Server component; the
 * `(admin)/admin` layout has already enforced the ADMIN gate, and
 * `getAdminOrder` assumes that.
 *
 * An unknown order number renders the `(admin)` group's generic 404 via
 * `notFound()` rather than a bespoke "not found" state — ops routes don't
 * need the softer, on-brand empty state the storefront uses.
 */
export default async function AdminOrderDetailPage({ params }: OrderDetailPageProps) {
  const { orderNumber } = await params
  const order = await getAdminOrder(orderNumber)
  if (!order) notFound()

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Link href="/admin/orders" className="text-sm text-muted-foreground hover:text-foreground">
          &larr; Back to orders
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-2xl font-semibold text-foreground">Order {order.orderNumber}</h1>
          <StatusBadge status={order.status} />
          {order.isGift ? <Badge variant="secondary">Gift</Badge> : null}
        </div>
      </div>

      {order.isGift ? (
        <div
          role="note"
          className="rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm font-medium text-foreground"
        >
          Gift order &mdash; do not include a price slip or invoice in the parcel.
        </div>
      ) : null}

      <div className="flex flex-col gap-1 rounded-xl border border-border p-4">
        <h2 className="text-sm font-medium text-foreground">Fulfilment timeline</h2>
        <dl className="flex flex-col text-sm text-muted-foreground">
          <div className="flex items-center justify-between gap-4 py-1">
            <dt>Placed</dt>
            <dd>{formatTimestamp(order.placedAt)}</dd>
          </div>
          {order.paidAt ? (
            <div className="flex items-center justify-between gap-4 py-1">
              <dt>Paid</dt>
              <dd>{formatTimestamp(order.paidAt)}</dd>
            </div>
          ) : null}
          {order.shippedAt ? (
            <div className="flex flex-col gap-1 border-t border-border py-1">
              <div className="flex items-center justify-between gap-4">
                <dt>Shipped</dt>
                <dd>{formatTimestamp(order.shippedAt)}</dd>
              </div>
              {order.trackingCarrier || order.trackingNumber || order.shipbubbleOrderId ? (
                <dd className="text-xs">
                  {[
                    order.trackingCarrier,
                    order.trackingNumber,
                    order.shipbubbleOrderId ? `ShipBubble ref ${order.shipbubbleOrderId}` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </dd>
              ) : null}
            </div>
          ) : null}
          {order.deliveredAt ? (
            <div className="flex items-center justify-between gap-4 border-t border-border py-1">
              <dt>Delivered</dt>
              <dd>{formatTimestamp(order.deliveredAt)}</dd>
            </div>
          ) : null}
          {order.cancelledAt ? (
            <div className="flex items-center justify-between gap-4 border-t border-border py-1">
              <dt>Cancelled</dt>
              <dd>{formatTimestamp(order.cancelledAt)}</dd>
            </div>
          ) : null}
          {order.refundedAt ? (
            <div className="flex items-center justify-between gap-4 border-t border-border py-1">
              <dt>Refunded</dt>
              <dd>{formatTimestamp(order.refundedAt)}</dd>
            </div>
          ) : null}
        </dl>
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
          <span>{order.email}</span>
        </div>
      </div>

      <div className="flex flex-col gap-1 rounded-xl border border-border p-4">
        <h2 className="text-sm font-medium text-foreground">Payment</h2>
        <div className="flex flex-col text-sm text-muted-foreground">
          <span>Paystack reference: {order.paystackReference ?? 'Not yet paid'}</span>
          <span>Paid: {order.paidAt ? formatTimestamp(order.paidAt) : 'Not yet paid'}</span>
        </div>
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

      <OrderActions
        orderNumber={order.orderNumber}
        status={order.status}
        nigeria={isNigeria(order.address.country)}
        refundOwed={order.refundOwed}
        refundedAt={order.refundedAt}
        refundReference={order.refundReference}
        paystackReference={order.paystackReference}
        paidShipping={{
          amountMinor: order.summary.shipping.amountMinor,
          currency: order.summary.shipping.currency,
          label: order.shippingLabel,
        }}
      />
    </div>
  )
}
