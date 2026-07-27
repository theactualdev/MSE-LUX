import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getCustomer } from '@/features/admin/customers/data'
import { StatusBadge } from '@/features/admin/orders/components/status-badge'
import { formatMoney } from '@/lib/money/format'
import type { Currency } from '@/types/money'

export const metadata: Metadata = { title: 'Customer' }

interface CustomerDetailPageProps {
  params: Promise<{ id: string }>
}

/**
 * `/admin/customers/[id]` — full customer detail for ops: profile card (name,
 * email, phone, joined date, and a display-only role line — role changes are
 * a runbook job, never something this UI can trigger), saved addresses as
 * read-only cards (mirroring the order detail page's shipping-address-card
 * presentation idiom), and full order history linking to the per-order admin
 * detail page. Server component; the `(admin)/admin` layout has already
 * enforced the ADMIN gate, and `getCustomer` assumes that.
 *
 * An unknown id renders the `(admin)` group's generic 404 via `notFound()`,
 * same as the order detail page.
 */
export default async function AdminCustomerDetailPage({ params }: CustomerDetailPageProps) {
  const { id } = await params
  const customer = await getCustomer(id)
  if (!customer) notFound()

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Link href="/admin/customers" className="text-sm text-muted-foreground hover:text-foreground">
          &larr; Back to customers
        </Link>
        <h1 className="font-display text-2xl font-semibold text-foreground">{customer.name ?? customer.email}</h1>
      </div>

      <div className="flex flex-col gap-1 rounded-xl border border-border p-4">
        <h2 className="text-sm font-medium text-foreground">Profile</h2>
        <dl className="flex flex-col text-sm text-muted-foreground">
          <div className="flex items-center justify-between gap-4 py-1">
            <dt>Name</dt>
            <dd>{customer.name ?? '—'}</dd>
          </div>
          <div className="flex items-center justify-between gap-4 border-t border-border py-1">
            <dt>Email</dt>
            <dd>{customer.email}</dd>
          </div>
          <div className="flex items-center justify-between gap-4 border-t border-border py-1">
            <dt>Phone</dt>
            <dd>{customer.phone ?? '—'}</dd>
          </div>
          <div className="flex items-center justify-between gap-4 border-t border-border py-1">
            <dt>Joined</dt>
            <dd>{new Date(customer.createdAt).toLocaleDateString('en-NG')}</dd>
          </div>
        </dl>
        <p className="pt-2 text-xs text-muted-foreground">
          Role: {customer.role} — managed outside the app (see the admin runbook)
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-foreground">Addresses</h2>
        {customer.addresses.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
            No saved addresses.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {customer.addresses.map((address) => (
              <div key={address.id} className="flex flex-col gap-1 rounded-xl border border-border p-4">
                {address.isDefault ? (
                  <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Default</span>
                ) : null}
                <div className="flex flex-col text-sm text-muted-foreground">
                  <span className="text-foreground">{address.fullName}</span>
                  <span>
                    {address.line1}
                    {address.line2 ? `, ${address.line2}` : ''}
                  </span>
                  <span>
                    {address.city}, {address.state}, {address.country}
                    {address.postalCode ? ` ${address.postalCode}` : ''}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-foreground">Orders</h2>
        {customer.orders.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
            No orders yet.
          </p>
        ) : (
          <div className="flex flex-col divide-y divide-border rounded-xl border border-border">
            {customer.orders.map((order) => (
              <Link
                key={order.orderNumber}
                href={`/admin/orders/${order.orderNumber}`}
                className="flex flex-col gap-2 p-4 transition-colors hover:bg-muted sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex flex-col gap-1">
                  <span className="font-display text-sm font-medium text-foreground">{order.orderNumber}</span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(order.placedAt).toLocaleDateString('en-NG')}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge status={order.status} />
                  {order.paid ? (
                    <span className="text-xs font-medium text-muted-foreground" aria-label="Paid">
                      &bull; Paid
                    </span>
                  ) : null}
                  <span className="text-sm font-medium text-foreground">
                    {formatMoney({ amountMinor: order.totalMinor, currency: order.currency as Currency })}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
