import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { formatMoney } from '@/lib/money'
import type { MockOrder } from '@/features/account/data/orders'

interface OrderRowProps {
  order: MockOrder
}

/**
 * Single order summary row for the order history list: order number, placed
 * date (derived from the order's stored `placedAt`, not `Date.now()`), item
 * count, order total, and a status badge. Links to the order's detail page.
 */
export function OrderRow({ order }: OrderRowProps) {
  const itemCount = order.lines.reduce((sum, line) => sum + line.quantity, 0)
  const placedDate = new Date(order.placedAt).toLocaleDateString('en-NG', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  return (
    <Link
      href={`/account/orders/${order.orderNumber}`}
      className="flex flex-col gap-3 rounded-xl border border-border p-4 transition-colors hover:bg-muted sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex flex-col gap-1">
        <span className="font-display text-sm font-medium text-foreground">{order.orderNumber}</span>
        <span className="text-xs text-muted-foreground">
          Placed {placedDate} &middot; {itemCount} {itemCount === 1 ? 'item' : 'items'}
        </span>
      </div>

      <div className="flex items-center gap-3">
        <Badge variant="secondary">{order.status}</Badge>
        <span className="text-sm font-medium text-foreground">{formatMoney(order.summary.total, 'en-NG')}</span>
      </div>
    </Link>
  )
}
