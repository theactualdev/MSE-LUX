import { Badge } from '@/components/ui/badge'
import type { OrderStatus } from '@/generated/prisma/client'

/** Title-cases the Prisma `OrderStatus` enum value for display, e.g. `PENDING` → `Pending`. */
function statusLabel(status: string): string {
  return status.charAt(0) + status.slice(1).toLowerCase()
}

/**
 * Per-status Badge variant: DELIVERED reads as the "done, good" state (default/accent),
 * CANCELLED reads as the "done, bad" state (destructive); everything still in flight
 * (PENDING/PROCESSING/SHIPPED) is neutral secondary.
 */
const STATUS_VARIANT: Record<OrderStatus, 'default' | 'destructive' | 'secondary'> = {
  PENDING: 'secondary',
  PROCESSING: 'secondary',
  SHIPPED: 'secondary',
  DELIVERED: 'default',
  CANCELLED: 'destructive',
}

/** Status pill for an admin order row/detail: title-cased label, per-status variant. Server-compatible. */
export function StatusBadge({ status }: { status: OrderStatus }) {
  return <Badge variant={STATUS_VARIANT[status]}>{statusLabel(status)}</Badge>
}
