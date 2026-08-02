import type { Metadata } from 'next'
import Link from 'next/link'
import { listDiscounts } from '@/features/admin/discounts/data'
import { DiscountFormDialog, DiscountActiveToggle } from '@/features/admin/discounts/components/discount-form'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export const metadata: Metadata = { title: 'Discounts' }

const DATE_FORMAT = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

function usageLabel(timesUsed: number, maxUses: number | null): string {
  if (maxUses === null) return `${timesUsed} used`
  return `${timesUsed} / ${maxUses} used`
}

function discountsHref(page: number): string {
  return page > 1 ? `/admin/discounts?page=${page}` : '/admin/discounts'
}

/**
 * Admin discount-code list: create/edit dialogs and an enable/disable
 * control (`DiscountFormDialog`/`DiscountActiveToggle`, both client), Prev/Next
 * pagination (URL state, back-button-safe) — same layout idioms as
 * `/admin/newsletter`. Server component; the `(admin)/admin` layout has
 * already enforced the ADMIN gate.
 */
export default async function AdminDiscountsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const page = Math.max(1, Number(typeof params.page === 'string' ? params.page : '1') || 1)

  const { discounts, total, pageCount } = await listDiscounts({ page })

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-foreground">Discounts</h1>
        <DiscountFormDialog />
      </div>

      {discounts.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
          No discount codes yet.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {discounts.map((discount) => (
            <li key={discount.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-medium text-foreground">{discount.code}</span>
                  <Badge variant={discount.active ? 'default' : 'secondary'}>{discount.active ? 'Active' : 'Disabled'}</Badge>
                </div>
                <span className="text-xs text-muted-foreground">
                  {discount.percentOff}% off · {usageLabel(discount.timesUsed, discount.maxUses)}
                  {discount.expiresAt ? ` · expires ${DATE_FORMAT.format(discount.expiresAt)}` : ' · no expiry'}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <DiscountFormDialog discount={discount} />
                <DiscountActiveToggle id={discount.id} active={discount.active} />
              </div>
            </li>
          ))}
        </ul>
      )}

      {pageCount > 1 ? (
        <div className="flex items-center justify-between text-sm">
          <Link
            href={discountsHref(Math.max(1, page - 1))}
            aria-disabled={page <= 1}
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), page <= 1 && 'pointer-events-none opacity-50')}
          >
            Prev
          </Link>
          <span className="text-muted-foreground">
            Page {page} of {pageCount} · {total} {total === 1 ? 'code' : 'codes'}
          </span>
          <Link
            href={discountsHref(Math.min(pageCount, page + 1))}
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
