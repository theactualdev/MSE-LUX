import { Badge } from '@/components/ui/badge'
import type { ProductStatus } from '@/generated/prisma/client'

/** Title-cases the Prisma `ProductStatus` enum value for display, e.g. `ACTIVE` → `Active`. */
function statusLabel(status: ProductStatus): string {
  return status.charAt(0) + status.slice(1).toLowerCase()
}

/**
 * Per-status Badge variant: ACTIVE reads as the "live" state (default/accent),
 * DRAFT is neutral secondary.
 */
const STATUS_VARIANT: Record<ProductStatus, 'default' | 'secondary'> = {
  ACTIVE: 'default',
  DRAFT: 'secondary',
}

/** Status pill for an admin product row/detail: title-cased label, per-status variant. Server-compatible. */
export function ProductStatusBadge({ status }: { status: ProductStatus }) {
  return <Badge variant={STATUS_VARIANT[status]}>{statusLabel(status)}</Badge>
}
