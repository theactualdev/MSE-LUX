'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { BookShipmentDialog } from '@/features/admin/orders/components/book-shipment-dialog'
import { shipOrderAction, deliverOrderAction, cancelOrderAction } from '@/features/admin/orders/actions'
import type { OrderStatus } from '@/generated/prisma/client'

const GENERIC_ERROR = 'Something went wrong. Please try again.'
const CONFLICT_ERROR = 'This order changed before the request went through. Refresh and try again.'

interface OrderActionsProps {
  orderNumber: string
  status: OrderStatus
  nigeria: boolean
  refundOwed: boolean
  paidShipping: { amountMinor: number; currency: string; label: string }
}

/**
 * Status-appropriate action panel for the admin order detail page — every
 * mutation goes through the T6 Server Actions (never thrown, always a typed
 * `{ ok }` result) inside `useTransition`, and a successful call always ends
 * with `router.refresh()` so the panel's own next render is driven by
 * `getAdminOrder`'s fresh read rather than local optimistic state.
 *
 * PROCESSING is the only status with three live actions (book shipment —
 * Nigeria only — enter tracking manually, and cancel); SHIPPED only offers
 * "Mark delivered"; PENDING only offers cancel (no restock, since stock is
 * only ever taken at payment); DELIVERED/CANCELLED offer nothing further,
 * except a CANCELLED order with `refundOwed` still gets a standing notice —
 * the actual refund is a manual, out-of-band step (8d).
 */
export function OrderActions({ orderNumber, status, nigeria, refundOwed, paidShipping }: OrderActionsProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const [bookingOpen, setBookingOpen] = useState(false)
  const [manualOpen, setManualOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)

  const [carrier, setCarrier] = useState('')
  const [trackingNumber, setTrackingNumber] = useState('')
  const [manualError, setManualError] = useState<string | undefined>(undefined)
  const [actionError, setActionError] = useState<string | undefined>(undefined)
  const [cancelError, setCancelError] = useState<string | undefined>(undefined)

  function handleShip() {
    const trimmedCarrier = carrier.trim()
    const trimmedTrackingNumber = trackingNumber.trim()
    if (!trimmedCarrier || !trimmedTrackingNumber) {
      setManualError('Enter both a carrier and a tracking number.')
      return
    }
    setManualError(undefined)
    setActionError(undefined)
    startTransition(async () => {
      const result = await shipOrderAction(orderNumber, { carrier: trimmedCarrier, trackingNumber: trimmedTrackingNumber })
      if (result.ok) {
        setManualOpen(false)
        setCarrier('')
        setTrackingNumber('')
        router.refresh()
      } else {
        setActionError(result.error === 'conflict' ? CONFLICT_ERROR : GENERIC_ERROR)
      }
    })
  }

  function handleDeliver() {
    setActionError(undefined)
    startTransition(async () => {
      const result = await deliverOrderAction(orderNumber)
      if (result.ok) {
        router.refresh()
      } else {
        setActionError(result.error === 'conflict' ? CONFLICT_ERROR : GENERIC_ERROR)
      }
    })
  }

  function handleCancel() {
    setCancelError(undefined)
    startTransition(async () => {
      const result = await cancelOrderAction(orderNumber)
      if (result.ok) {
        setCancelOpen(false)
        router.refresh()
      } else {
        // Rendered inside the still-open confirm dialog, not the top-level
        // banner: base-ui marks the rest of the tree `aria-hidden` while a
        // dialog is open, so a banner outside it would be invisible to the
        // accessibility tree (and to anyone using assistive tech) precisely
        // when it's needed.
        setCancelError(result.error === 'conflict' ? CONFLICT_ERROR : GENERIC_ERROR)
      }
    })
  }

  if (status === 'DELIVERED') return null

  if (status === 'CANCELLED') {
    if (!refundOwed) return null
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
        Refund owed &mdash; process this order&apos;s refund in Paystack; nothing further happens automatically.
      </div>
    )
  }

  const showBookShipment = status === 'PROCESSING' && nigeria
  const showManualTracking = status === 'PROCESSING'
  const showMarkDelivered = status === 'SHIPPED'
  const showCancel = status === 'PENDING' || status === 'PROCESSING'

  return (
    <div className="flex flex-col gap-4">
      {actionError ? (
        <p role="alert" className="text-sm text-destructive">
          {actionError}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {showBookShipment ? (
          <Button type="button" disabled={pending} onClick={() => setBookingOpen(true)}>
            Book shipment
          </Button>
        ) : null}
        {showManualTracking ? (
          <Button type="button" variant="outline" disabled={pending} onClick={() => setManualOpen((open) => !open)}>
            Enter tracking manually
          </Button>
        ) : null}
        {showMarkDelivered ? (
          <Button type="button" disabled={pending} onClick={handleDeliver}>
            Mark delivered
          </Button>
        ) : null}
        {showCancel ? (
          <Button
            type="button"
            variant="destructive"
            disabled={pending}
            onClick={() => {
              setCancelError(undefined)
              setCancelOpen(true)
            }}
          >
            Cancel order
          </Button>
        ) : null}
      </div>

      {showManualTracking && manualOpen ? (
        <div className="flex flex-col gap-3 rounded-xl border border-border p-4">
          {manualError ? (
            <p role="alert" className="text-sm text-destructive">
              {manualError}
            </p>
          ) : null}
          <div className="flex flex-col gap-1">
            <Label htmlFor="order-actions-carrier">Carrier</Label>
            <Input
              id="order-actions-carrier"
              value={carrier}
              onChange={(event) => setCarrier(event.target.value)}
              disabled={pending}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="order-actions-tracking-number">Tracking number</Label>
            <Input
              id="order-actions-tracking-number"
              value={trackingNumber}
              onChange={(event) => setTrackingNumber(event.target.value)}
              disabled={pending}
            />
          </div>
          <Button type="button" className="self-start" disabled={pending} onClick={handleShip}>
            Mark shipped
          </Button>
        </div>
      ) : null}

      {showBookShipment ? (
        <BookShipmentDialog
          orderNumber={orderNumber}
          paidShipping={paidShipping}
          open={bookingOpen}
          onOpenChange={setBookingOpen}
          onShipped={() => {
            setBookingOpen(false)
            router.refresh()
          }}
        />
      ) : null}

      {showCancel ? (
        <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Cancel this order?</DialogTitle>
              <DialogDescription>
                {status === 'PROCESSING'
                  ? 'This restocks every line item and marks a refund as owed to the customer.'
                  : 'This order has not been paid, so cancelling it now is final and immediate.'}
              </DialogDescription>
            </DialogHeader>
            {cancelError ? (
              <p role="alert" className="text-sm text-destructive">
                {cancelError}
              </p>
            ) : null}
            <DialogFooter>
              <Button type="button" variant="outline" disabled={pending} onClick={() => setCancelOpen(false)}>
                Keep order
              </Button>
              <Button type="button" variant="destructive" disabled={pending} onClick={handleCancel}>
                Confirm cancel
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  )
}
