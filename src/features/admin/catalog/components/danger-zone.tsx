'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { archiveProductAction, restoreProductAction, deleteProductAction } from '@/features/admin/catalog/actions'
import type { ProductStatus } from '@/generated/prisma/client'

const GENERIC_ERROR = 'Something went wrong. Please try again.'
const CONFLICT_ERROR = 'Something changed — refresh and try again'

interface DangerZoneProps {
  productId: string
  productName: string
  status: ProductStatus
  hasOrderLines: boolean
}

/**
 * The catalog edit page's danger zone. A product with any order history
 * (`hasOrderLines`) can never be hard-deleted — the engine's `deleteProduct`
 * refuses it (`has-orders`) — so this panel doesn't even offer the button in
 * that case; it explains why and offers the reversible ACTIVE⇄DRAFT toggle
 * instead. A product with no order history gets a guarded delete behind a
 * confirm dialog that names the product, mirroring `OrderActions`'s cancel
 * dialog idiom (useTransition, router.refresh on non-navigating success,
 * `role="alert"` failures rendered inside the still-open dialog).
 */
export function DangerZone({ productId, productName, status, hasOrderLines }: DangerZoneProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteError, setDeleteError] = useState<string | undefined>(undefined)
  const [statusError, setStatusError] = useState<string | undefined>(undefined)

  function handleDelete() {
    setDeleteError(undefined)
    startTransition(async () => {
      const result = await deleteProductAction(productId)
      if (result.ok) {
        router.push('/admin/catalog')
        return
      }
      setDeleteError(result.error === 'conflict' ? CONFLICT_ERROR : GENERIC_ERROR)
    })
  }

  function handleArchive() {
    setStatusError(undefined)
    startTransition(async () => {
      const result = await archiveProductAction(productId)
      if (result.ok) {
        router.refresh()
        return
      }
      setStatusError(result.error === 'conflict' ? CONFLICT_ERROR : GENERIC_ERROR)
    })
  }

  function handleRestore() {
    setStatusError(undefined)
    startTransition(async () => {
      const result = await restoreProductAction(productId)
      if (result.ok) {
        router.refresh()
        return
      }
      setStatusError(result.error === 'conflict' ? CONFLICT_ERROR : GENERIC_ERROR)
    })
  }

  return (
    <Card className="border-destructive/30">
      <CardHeader>
        <CardTitle className="text-destructive">Danger zone</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {hasOrderLines ? (
          <>
            <p className="text-sm text-muted-foreground">
              This product has order history, so it can&apos;t be deleted. Archive it instead to hide it from the storefront.
            </p>
            {statusError ? (
              <p role="alert" className="text-sm text-destructive">
                {statusError}
              </p>
            ) : null}
            {status === 'ACTIVE' ? (
              <Button type="button" variant="outline" disabled={pending} onClick={handleArchive} className="self-start">
                Archive product
              </Button>
            ) : (
              <Button type="button" variant="outline" disabled={pending} onClick={handleRestore} className="self-start">
                Restore product
              </Button>
            )}
          </>
        ) : (
          <Button
            type="button"
            variant="destructive"
            disabled={pending}
            onClick={() => {
              setDeleteError(undefined)
              setDeleteOpen(true)
            }}
            className="self-start"
          >
            Delete product
          </Button>
        )}
      </CardContent>

      {!hasOrderLines ? (
        <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete {productName}?</DialogTitle>
              <DialogDescription>This permanently removes the product. This cannot be undone.</DialogDescription>
            </DialogHeader>
            {deleteError ? (
              <p role="alert" className="text-sm text-destructive">
                {deleteError}
              </p>
            ) : null}
            <DialogFooter>
              <Button type="button" variant="outline" disabled={pending} onClick={() => setDeleteOpen(false)}>
                Keep product
              </Button>
              <Button type="button" variant="destructive" disabled={pending} onClick={handleDelete}>
                Confirm delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </Card>
  )
}
