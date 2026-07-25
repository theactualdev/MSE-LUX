'use client'

import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Button } from '@/components/ui/button'
import { getBookingRatesAction, bookShipmentAction } from '@/features/admin/orders/actions'
import { formatMoney } from '@/lib/money/format'
import type { Currency } from '@/types/money'
import { cn } from '@/lib/utils'

interface PaidShipping {
  amountMinor: number
  currency: string
  label: string
}

interface Rate {
  courierId: string
  serviceCode: string
  label: string
  amountMinor: number
  currency: string
  deliveryEta?: string
}

interface BookShipmentDialogProps {
  orderNumber: string
  paidShipping: PaidShipping
  open: boolean
  onOpenChange: (open: boolean) => void
  onShipped: () => void
}

/** Compares a courier rate against what the customer already paid for shipping. */
function deltaLabel(deltaMinor: number, currency: string): string {
  const formatted = formatMoney({ amountMinor: Math.abs(deltaMinor), currency: currency as Currency })
  if (deltaMinor === 0) return `Matches what the customer paid (${formatted}).`
  return deltaMinor > 0 ? `${formatted} more than the customer paid.` : `${formatted} less than the customer paid.`
}

/**
 * Booking dialog for a PROCESSING Nigerian order's shipment: on open, quotes
 * live courier rates via `getBookingRatesAction`, lets the admin pick one
 * (pre-selecting/highlighting whichever rate matches the label the customer
 * was originally charged for), and books it via `bookShipmentAction`, which
 * flips the order to SHIPPED server-side. A rates failure surfaces an alert
 * pointing at the manual-tracking fallback instead of leaving a dead dialog;
 * a booking `conflict` that still carries a `shipbubbleOrderId` (the label
 * was created at ShipBubble before the order-side flip lost the race) shows
 * that reference so ops can reconcile it by hand rather than losing it.
 */
export function BookShipmentDialog({
  orderNumber,
  paidShipping,
  open,
  onOpenChange,
  onShipped,
}: BookShipmentDialogProps) {
  // Seeded from `open` (not a hardcoded `false`): if the dialog mounts already
  // open, the fetch effect below fires on this same commit, so the RadioGroup
  // must not render — even for a tick — with an empty `rates` array. Base UI's
  // RadioGroup treats an `undefined` -> defined `value` transition as an
  // illegal uncontrolled -> controlled switch, so `selectedIndex` (and the
  // radios) must only ever appear once fetched, never as an initial empty pass.
  const [loading, setLoading] = useState(open)
  const [requestToken, setRequestToken] = useState<string | undefined>(undefined)
  const [rates, setRates] = useState<Rate[]>([])
  const [selectedIndex, setSelectedIndex] = useState<number | undefined>(undefined)
  const [ratesError, setRatesError] = useState<string | undefined>(undefined)
  const [bookError, setBookError] = useState<string | undefined>(undefined)
  const [booking, setBooking] = useState(false)

  // Reset to a clean slate each time the dialog opens, using the "adjust
  // state during render" pattern (react.dev/learn/you-might-not-need-an-effect
  // — the same idiom `search-overlay.tsx` uses) rather than a setState-in-effect,
  // which avoids an extra cascading render and keeps the fetch effect below
  // free of synchronous setState calls in its body.
  const [prevOpen, setPrevOpen] = useState(open)
  if (prevOpen !== open) {
    setPrevOpen(open)
    if (open) {
      setLoading(true)
      setRatesError(undefined)
      setBookError(undefined)
      setRequestToken(undefined)
      setRates([])
      setSelectedIndex(undefined)
    }
  }

  useEffect(() => {
    if (!open) return

    let cancelled = false
    getBookingRatesAction(orderNumber).then((result) => {
      if (cancelled) return
      setLoading(false)
      if (result.ok) {
        setRequestToken(result.requestToken)
        setRates(result.rates)
        const preselect = result.rates.findIndex((rate) => rate.label === paidShipping.label)
        setSelectedIndex(preselect >= 0 ? preselect : 0)
      } else {
        setRatesError('Could not fetch shipping rates for this order.')
      }
    })

    return () => {
      cancelled = true
    }
  }, [open, orderNumber, paidShipping.label])

  const selectedRate = selectedIndex !== undefined ? rates[selectedIndex] : undefined

  function handleBook() {
    if (!requestToken || !selectedRate) return
    setBooking(true)
    setBookError(undefined)
    bookShipmentAction(orderNumber, {
      requestToken,
      courierId: selectedRate.courierId,
      serviceCode: selectedRate.serviceCode,
    }).then((result) => {
      setBooking(false)
      if (result.ok) {
        onShipped()
        return
      }
      const reference = 'shipbubbleOrderId' in result ? result.shipbubbleOrderId : undefined
      setBookError(
        reference
          ? `Booking may have gone through at ShipBubble (reference ${reference}), but marking the order shipped failed. Check ShipBubble before retrying.`
          : 'Booking failed. Please try again, or enter tracking manually instead.',
      )
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Book shipment</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          Customer paid {formatMoney({ amountMinor: paidShipping.amountMinor, currency: paidShipping.currency as Currency })}{' '}
          for {paidShipping.label}.
        </p>

        {loading ? <p className="text-sm text-muted-foreground">Loading rates&hellip;</p> : null}

        {ratesError ? (
          <div role="alert" className="flex flex-col gap-1 text-sm text-destructive">
            <p>{ratesError}</p>
            <p>Close this dialog and enter tracking manually instead.</p>
          </div>
        ) : null}

        {!loading && !ratesError ? (
          <RadioGroup
            aria-label="Courier"
            value={selectedIndex !== undefined ? String(selectedIndex) : undefined}
            onValueChange={(value) => setSelectedIndex(Number(value))}
          >
            {rates.map((rate, index) => (
              <label
                key={`${rate.courierId}-${rate.serviceCode}`}
                className={cn(
                  'flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-border p-3 transition-colors',
                  selectedIndex === index && 'border-accent bg-accent/5',
                )}
              >
                <span className="flex items-center gap-3">
                  <RadioGroupItem value={String(index)} />
                  <span className="flex flex-col">
                    <span className="text-sm font-medium text-foreground">{rate.label}</span>
                    {rate.label === paidShipping.label ? (
                      <span className="text-xs font-medium text-accent">Customer&apos;s choice</span>
                    ) : null}
                  </span>
                </span>
                <span className="text-sm font-medium text-foreground">
                  {formatMoney({ amountMinor: rate.amountMinor, currency: rate.currency as Currency })}
                </span>
              </label>
            ))}
          </RadioGroup>
        ) : null}

        {!loading && !ratesError && selectedRate && paidShipping.currency === 'NGN' ? (
          <p className="text-sm text-muted-foreground">
            {deltaLabel(selectedRate.amountMinor - paidShipping.amountMinor, paidShipping.currency)}
          </p>
        ) : null}

        {bookError ? (
          <p role="alert" className="text-sm text-destructive">
            {bookError}
          </p>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button type="button" onClick={handleBook} disabled={!selectedRate || booking}>
            Book & mark shipped
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
