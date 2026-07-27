import type { Metadata } from 'next'
import Link from 'next/link'
import { listCustomers } from '@/features/admin/customers/data'
import { formatMoney } from '@/lib/money/format'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export const metadata: Metadata = { title: 'Customers' }

/**
 * Builds an /admin/customers URL from the active filter set, resetting to
 * page 1 unless a page > 1 is explicitly given — mirrors `ordersHref` in the
 * orders list page.
 */
function customersHref(opts: { query?: string; page?: number }): string {
  const params = new URLSearchParams()
  if (opts.query) params.set('q', opts.query)
  if (opts.page && opts.page > 1) params.set('page', String(opts.page))
  const qs = params.toString()
  return qs ? `/admin/customers?${qs}` : '/admin/customers'
}

/**
 * Formats a customer's per-currency paid spend, omitting any currency whose
 * value is 0 — a customer who has only ever paid in USD shouldn't show a
 * "₦0.00" alongside it. Both zero (no paid orders yet) renders as "—".
 */
function formatSpend(spend: { ngn: number; usd: number }): string {
  const parts: string[] = []
  if (spend.ngn > 0) parts.push(formatMoney({ amountMinor: spend.ngn, currency: 'NGN' }))
  if (spend.usd > 0) parts.push(formatMoney({ amountMinor: spend.usd, currency: 'USD' }))
  return parts.length > 0 ? parts.join(' + ') : '—'
}

/**
 * Admin customers list: a GET search box (name / email), a bordered row list
 * linking to the per-customer detail page, and Prev/Next pagination — all
 * filter state lives in the URL so it's shareable/back-button-safe. Mirrors
 * the admin orders list page's idioms. Server component; the `(admin)/admin`
 * layout has already enforced the ADMIN gate.
 */
export default async function AdminCustomersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const query = typeof params.q === 'string' && params.q.trim() ? params.q.trim() : undefined
  const page = Math.max(1, Number(typeof params.page === 'string' ? params.page : '1') || 1)

  const { customers, total, pageCount } = await listCustomers({ search: query, page })

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-xl font-semibold text-foreground">Customers</h1>
        <p className="text-sm text-muted-foreground">
          {total} {total === 1 ? 'customer' : 'customers'}
        </p>
      </div>

      <form method="GET" className="flex gap-2">
        <Input
          type="search"
          name="q"
          defaultValue={query ?? ''}
          placeholder="Search by name or email"
          aria-label="Search customers"
          className="max-w-sm"
        />
        <Button type="submit" variant="outline" size="sm">
          Search
        </Button>
      </form>

      {customers.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
          No customers match.
        </p>
      ) : (
        <div className="flex flex-col divide-y divide-border rounded-xl border border-border">
          {customers.map((customer) => (
            <Link
              key={customer.id}
              href={`/admin/customers/${customer.id}`}
              className="flex flex-col gap-2 p-4 transition-colors hover:bg-muted sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex flex-col gap-1">
                <span className="font-display text-sm font-medium text-foreground">{customer.name ?? '—'}</span>
                <span className="text-xs text-muted-foreground">
                  {customer.email} &middot; Joined {new Date(customer.createdAt).toLocaleDateString('en-NG')}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground">
                  {customer.orderCount} {customer.orderCount === 1 ? 'order' : 'orders'}
                </span>
                <span className="text-sm font-medium text-foreground">{formatSpend(customer.paidSpend)}</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {pageCount > 1 ? (
        <div className="flex items-center justify-between text-sm">
          <Link
            href={customersHref({ query, page: Math.max(1, page - 1) })}
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
            href={customersHref({ query, page: Math.min(pageCount, page + 1) })}
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
