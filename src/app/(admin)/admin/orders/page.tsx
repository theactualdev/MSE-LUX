import type { Metadata } from 'next'
import Link from 'next/link'
import { OrderStatus } from '@/generated/prisma/client'
import { listAdminOrders, countRefundQueue } from '@/features/admin/orders/data'
import { StatusBadge } from '@/features/admin/orders/components/status-badge'
import { ReapButton } from '@/features/admin/orders/components/reap-button'
import { formatMoney } from '@/lib/money/format'
import { Input } from '@/components/ui/input'
import { Button, buttonVariants } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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

/**
 * Builds an /admin/orders URL from the active filter set, resetting to page 1
 * unless a page > 1 is explicitly given. `status` and `refundQueue` are
 * mutually exclusive tabs — callers pass at most one.
 */
function ordersHref(opts: { status?: OrderStatus; refundQueue?: boolean; query?: string; page?: number }): string {
  const params = new URLSearchParams()
  if (opts.status) params.set('status', opts.status)
  if (opts.refundQueue) params.set('refunds', '1')
  if (opts.query) params.set('q', opts.query)
  if (opts.page && opts.page > 1) params.set('page', String(opts.page))
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
  const refundQueue = params.refunds === '1'
  // The two tab dimensions are mutually exclusive — a `refunds=1` URL wins
  // over any `status` alongside it, same as clicking the Refund owed tab.
  const status = !refundQueue && isOrderStatus(rawStatus) ? rawStatus : undefined
  const query = typeof params.q === 'string' && params.q.trim() ? params.q.trim() : undefined
  const page = Math.max(1, Number(typeof params.page === 'string' ? params.page : '1') || 1)

  const [{ orders, total, pageCount }, refundQueueCount] = await Promise.all([
    listAdminOrders(refundQueue ? { refundQueue: true, query, page } : { status, query, page }),
    countRefundQueue(),
  ])

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-xl font-semibold text-foreground">Orders</h1>
        <div className="flex items-center gap-3">
          <p className="text-sm text-muted-foreground">
            {total} {total === 1 ? 'order' : 'orders'}
          </p>
          <ReapButton />
        </div>
      </div>

      <nav aria-label="Filter orders" className="flex flex-wrap gap-1">
        {STATUS_TABS.map((tab) => {
          const active = !refundQueue && tab === status
          return (
            <Link
              key={tab ?? 'all'}
              href={ordersHref({ status: tab, query })}
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
        <Link
          href={ordersHref({ refundQueue: true, query })}
          aria-current={refundQueue ? 'page' : undefined}
          className={cn(
            'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
            refundQueue
              ? 'bg-accent text-accent-foreground'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground',
          )}
        >
          Refund owed
          {refundQueueCount > 0 ? <Badge variant={refundQueue ? 'secondary' : 'destructive'}>{refundQueueCount}</Badge> : null}
        </Link>
      </nav>

      <form method="GET" className="flex gap-2">
        {status ? <input type="hidden" name="status" value={status} /> : null}
        {refundQueue ? <input type="hidden" name="refunds" value="1" /> : null}
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
                {order.isGift ? <Badge variant="secondary">Gift</Badge> : null}
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
            href={ordersHref({ status, refundQueue, query, page: Math.max(1, page - 1) })}
            aria-disabled={page <= 1}
            className={cn(
              buttonVariants({ variant: 'outline', size: 'sm' }),
              page <= 1 && 'pointer-events-none opacity-50',
            )}
          >
            Prev
          </Link>
          <span className="text-muted-foreground">
            Page {page} of {pageCount}
          </span>
          <Link
            href={ordersHref({ status, refundQueue, query, page: Math.min(pageCount, page + 1) })}
            aria-disabled={page >= pageCount}
            className={cn(
              buttonVariants({ variant: 'outline', size: 'sm' }),
              page >= pageCount && 'pointer-events-none opacity-50',
            )}
          >
            Next
          </Link>
        </div>
      ) : null}
    </div>
  )
}
