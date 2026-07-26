'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { reapAbandonedOrdersAction } from '@/features/admin/orders/actions'

const GENERIC_ERROR = 'Something went wrong. Please try again.'

/**
 * Admin-triggered "run the reaper now" button for the orders list header —
 * the same engine the secret-gated cron route (`api/cron/reap-orders`) runs
 * on a schedule (`vercel.json`, daily), exposed here as an ops-visible manual
 * re-check rather than a replacement for it. Confirming cancels every order
 * that's still PENDING (never paid) and was placed more than 24 hours ago;
 * nothing is restocked and no refund is recorded, since a PENDING order never
 * took stock or payment. A success response shows the cancelled count and
 * calls `router.refresh()` so the newly-CANCELLED orders drop out of the
 * list immediately.
 */
export function ReapButton() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)
  const [note, setNote] = useState<string | undefined>(undefined)

  function handleConfirm() {
    setError(undefined)
    startTransition(async () => {
      const result = await reapAbandonedOrdersAction()
      if (result.ok) {
        setOpen(false)
        setNote(`Cancelled ${result.reaped} abandoned orders`)
        router.refresh()
      } else {
        setError(GENERIC_ERROR)
      }
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          setError(undefined)
          setOpen(true)
        }}
      >
        Clean up abandoned orders
      </Button>
      {note ? (
        <p role="status" className="text-sm text-muted-foreground">
          {note}
        </p>
      ) : null}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clean up abandoned orders?</DialogTitle>
            <DialogDescription>
              This cancels every order that&apos;s still pending (never paid) and was placed more than 24 hours ago.
              Nothing is restocked and no refund is recorded, since these orders never took stock or payment. This
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={pending} onClick={handleConfirm}>
              Confirm clean up
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
