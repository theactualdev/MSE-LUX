import type { Metadata } from 'next'
import Link from 'next/link'
import { SubscriberStatus } from '@/generated/prisma/client'
import { listSubscribers } from '@/features/admin/newsletter/data'
import { ExportButton } from '@/features/admin/newsletter/components/export-button'
import { Input } from '@/components/ui/input'
import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export const metadata: Metadata = { title: 'Newsletter' }

const STATUS_TABS = [undefined, ...Object.values(SubscriberStatus)] as const

function isSubscriberStatus(value: string | undefined): value is SubscriberStatus {
  return typeof value === 'string' && (Object.values(SubscriberStatus) as string[]).includes(value)
}

function tabLabel(status: SubscriberStatus | undefined): string {
  if (!status) return 'All'
  return status.charAt(0) + status.slice(1).toLowerCase()
}

function newsletterHref(opts: { status?: SubscriberStatus; query?: string; page?: number }): string {
  const params = new URLSearchParams()
  if (opts.status) params.set('status', opts.status)
  if (opts.query) params.set('q', opts.query)
  if (opts.page && opts.page > 1) params.set('page', String(opts.page))
  const qs = params.toString()
  return qs ? `/admin/newsletter?${qs}` : '/admin/newsletter'
}

const DATE_FORMAT = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

/**
 * Admin newsletter list: status tabs, a GET email search, Prev/Next
 * pagination (all URL state, back-button-safe), per-status counts, and the
 * CSV export of confirmed subscribers. Server component; the `(admin)/admin`
 * layout has already enforced the ADMIN gate.
 */
export default async function AdminNewsletterPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const rawStatus = typeof params.status === 'string' ? params.status : undefined
  const status = isSubscriberStatus(rawStatus) ? rawStatus : undefined
  const query = typeof params.q === 'string' && params.q.trim() ? params.q.trim() : undefined
  const page = Math.max(1, Number(typeof params.page === 'string' ? params.page : '1') || 1)

  const { subscribers, total, pageCount, counts } = await listSubscribers({ status, search: query, page })

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-foreground">Newsletter</h1>
        <div className="flex items-center gap-3">
          <p className="text-sm text-muted-foreground">
            {counts.confirmed} confirmed · {counts.pending} pending · {counts.unsubscribed} unsubscribed
          </p>
          <ExportButton />
        </div>
      </div>

      <nav aria-label="Filter by status" className="flex flex-wrap gap-1">
        {STATUS_TABS.map((tab) => {
          const active = tab === status
          return (
            <Link
              key={tab ?? 'all'}
              href={newsletterHref({ status: tab, query })}
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

      <form method="GET" className="flex flex-wrap gap-2">
        {status ? <input type="hidden" name="status" value={status} /> : null}
        <Input
          type="search"
          name="q"
          defaultValue={query ?? ''}
          placeholder="Search by email"
          aria-label="Search subscribers"
          className="max-w-sm"
        />
        <Button type="submit" variant="outline" size="sm">
          Search
        </Button>
      </form>

      {subscribers.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
          No subscribers match.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {subscribers.map((subscriber) => (
            <li key={subscriber.id} className="flex flex-col gap-1 p-4 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-sm text-foreground">{subscriber.email}</span>
              <span className="text-xs text-muted-foreground">
                {tabLabel(subscriber.status)}
                {subscriber.confirmedAt ? ` · confirmed ${DATE_FORMAT.format(subscriber.confirmedAt)}` : ''}
                {` · joined ${DATE_FORMAT.format(subscriber.createdAt)}`}
              </span>
            </li>
          ))}
        </ul>
      )}

      {pageCount > 1 ? (
        <div className="flex items-center justify-between text-sm">
          <Link
            href={newsletterHref({ status, query, page: Math.max(1, page - 1) })}
            aria-disabled={page <= 1}
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), page <= 1 && 'pointer-events-none opacity-50')}
          >
            Prev
          </Link>
          <span className="text-muted-foreground">
            Page {page} of {pageCount} · {total} {total === 1 ? 'subscriber' : 'subscribers'}
          </span>
          <Link
            href={newsletterHref({ status, query, page: Math.min(pageCount, page + 1) })}
            aria-disabled={page >= pageCount}
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), page >= pageCount && 'pointer-events-none opacity-50')}
          >
            Next
          </Link>
        </div>
      ) : null}
    </div>
  )
}
