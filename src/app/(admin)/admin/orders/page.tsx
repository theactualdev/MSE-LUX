import type { Metadata } from 'next'
import Link from 'next/link'
import { OrderStatus } from '@/generated/prisma/client'
import { listAdminOrders } from '@/features/admin/orders/data'
import { StatusBadge } from '@/features/admin/orders/components/status-badge'
import { formatMoney } from '@/lib/money/format'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import type { Currency } from '@/types/money'
import { cn } from '@/lib/utils'

export const metadata: Metadata = { title: 'Orders' }

const STATUS_TABS = [undefined, ...Object.values(OrderStatus)] as const

function isOrderStatus(value: string | undefined): value is OrderStatus {
  return typeof value === 'string' && (Object.values(OrderStatus) as string[]).includes(value)
}

/** Title-cases a status for tab labels, e.g. `PROCESSING` -> `Processing`; `undefined` -> `All`. */
function tabLabel(status: OrderStatus | undefined): string {
  if (!status) return 'All'
  return status.charAt(0) + status.slice(1).toLowerCase()
}

/** Builds an /admin/orders URL for a given tab, preserving the current search query and resetting to page 1. */
function tabHref(status: OrderStatus | undefined, query: string | undefined): string {
  const params = new URLSearchParams()
  if (status) params.set('status', status)
  if (query) params.set('q', query)
  const qs = params.toString()
  return qs ? `/admin/orders?${qs}` : '/admin/orders'
}

/** Builds an /admin/orders URL for a given page, preserving the current status + search query. */
function pageHref(status: OrderStatus | undefined, query: string | undefined, page: number): string {
  const params = new URLSearchParams()
  if (status) params.set('status', status)
  if (query) params.set('q', query)
  if (page > 1) params.set('page', String(page))
  const qs = params.toString()
  return qs ? `/admin/orders?${qs}` : '/admin/orders'
}

/**
 * Admin orders list: status tabs (All + the five OrderStatus values), a GET
 * search box (order number / email), a bordered row list linking to the
 * per-order detail page, and Prev/Next pagination — all filter state lives in
 * the URL so it's shareable/back-button-safe. Server component; the
 * `(admin)/admin` layout has already enforced the ADMIN gate.
 */
export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const rawStatus = typeof params.status === 'string' ? params.status : undefined
  const status = isOrderStatus(rawStatus) ? rawStatus : undefined
  const query = typeof params.q === 'string' && params.q.trim() ? params.q.trim() : undefined
  const page = Math.max(1, Number(typeof params.page === 'string' ? params.page : '1') || 1)

  const { orders, total, pageCount } = await listAdminOrders({ status, query, page })

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="text-xl font-semibold text-foreground">Orders</h1>
        <p className="text-sm text-muted-foreground">
          {total} {total === 1 ? 'order' : 'orders'}
        </p>
      </div>

      <nav aria-label="Filter by status" className="flex flex-wrap gap-1">
        {STATUS_TABS.map((tab) => {
          const active = tab === status
          return (
            <Link
              key={tab ?? 'all'}
              href={tabHref(tab, query)}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                active
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              {tabLabel(tab)}
            </Link>
          )
        })}
      </nav>

      <form method="GET" className="flex gap-2">
        {status ? <input type="hidden" name="status" value={status} /> : null}
        <Input
          type="search"
          name="q"
          defaultValue={query ?? ''}
          placeholder="Search by order number or email"
          aria-label="Search orders"
          className="max-w-sm"
        />
        <Button type="submit" variant="outline" size="sm">
          Search
        </Button>
      </form>

      {orders.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
          No orders match.
        </p>
      ) : (
        <div className="flex flex-col divide-y divide-border rounded-xl border border-border">
          {orders.map((order) => (
            <Link
              key={order.orderNumber}
              href={`/admin/orders/${order.orderNumber}`}
              className="flex flex-col gap-2 p-4 transition-colors hover:bg-muted sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex flex-col gap-1">
                <span className="font-display text-sm font-medium text-foreground">{order.orderNumber}</span>
                <span className="text-xs text-muted-foreground">
                  {new Date(order.placedAt).toLocaleDateString('en-NG')} &middot; {order.email}
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

      {pageCount > 1 ? (
        <div className="flex items-center justify-between text-sm">
          <Link
            href={pageHref(status, query, Math.max(1, page - 1))}
            aria-disabled={page <= 1}
            className={cn(
              'font-medium',
              page <= 1 ? 'pointer-events-none text-muted-foreground/50' : 'text-foreground hover:underline',
            )}
          >
            Prev
          </Link>
          <span className="text-muted-foreground">
            Page {page} of {pageCount}
          </span>
          <Link
            href={pageHref(status, query, Math.min(pageCount, page + 1))}
            aria-disabled={page >= pageCount}
            className={cn(
              'font-medium',
              page >= pageCount ? 'pointer-events-none text-muted-foreground/50' : 'text-foreground hover:underline',
            )}
          >
            Next
          </Link>
        </div>
      ) : null}
    </div>
  )
}
