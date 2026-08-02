'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { createDiscountAction, updateDiscountAction, setDiscountActiveAction } from '@/features/admin/discounts/actions'
import type { DiscountRow } from '@/features/admin/discounts/data'

const GENERIC_ERROR = 'Something went wrong. Please try again.'

/** `<input type="date">` value (`YYYY-MM-DD`) for a stored `expiresAt`, or `''` for no expiry. */
function toDateInputValue(date: Date | null): string {
  if (!date) return ''
  return date.toISOString().slice(0, 10)
}

/**
 * The inverse of `toDateInputValue` — `''` means "never expires", so it maps
 * back to `null`, not epoch. Anchors on the END of the chosen day
 * (`T23:59:59.999Z`), not its start: the engine (`resolveUsableCode`)
 * rejects on `expiresAt <= now`, so an admin who picks "5 Aug" as the expiry
 * — and whose admin list row reads "expires 5 Aug" — means the code should
 * stay usable through all of 5 August. Anchoring on `T00:00:00.000Z` instead
 * would make the code dead for the entire stated day (from 01:00 WAT in the
 * primary market, an hour after midnight), directly contradicting what the
 * form and the list both told the admin.
 */
function parseDateInput(value: string): Date | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const parsed = new Date(`${trimmed}T23:59:59.999Z`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

interface DiscountFormDialogProps {
  /** Present => edit this row; absent => create a new one. */
  discount?: DiscountRow
}

/**
 * Create/edit dialog for one discount code. Unlike the catalog's product
 * forms, create and edit ask for exactly the same fields, so ONE component
 * covers both modes rather than a create/edit pair — mode is inferred from
 * whether `discount` is passed. Self-contained: owns its own trigger button
 * and open state (mirrors `DangerZone`'s delete-confirm dialog and
 * `CollectionManager`'s create/edit dialog), so the list page just drops one
 * of these per row plus one bare instance for "New discount".
 *
 * `percentOff` is clamped 1..100 here as a UX affordance only — the real
 * guarantee against a negative order total lives in
 * `@/features/discounts/discount.ts` (`resolveUsableCode` refuses an
 * out-of-range row; `computeDiscountMinor` clamps regardless of what reaches
 * it).
 */
export function DiscountFormDialog({ discount }: DiscountFormDialogProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | undefined>(undefined)

  const [code, setCode] = useState(discount?.code ?? '')
  const [percentOffInput, setPercentOffInput] = useState(discount ? String(discount.percentOff) : '')
  const [maxUsesInput, setMaxUsesInput] = useState(discount?.maxUses != null ? String(discount.maxUses) : '')
  const [expiresAtInput, setExpiresAtInput] = useState(toDateInputValue(discount?.expiresAt ?? null))

  function resetFields() {
    setCode(discount?.code ?? '')
    setPercentOffInput(discount ? String(discount.percentOff) : '')
    setMaxUsesInput(discount?.maxUses != null ? String(discount.maxUses) : '')
    setExpiresAtInput(toDateInputValue(discount?.expiresAt ?? null))
    setError(undefined)
  }

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) resetFields()
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(undefined)

    const percentOff = Number.parseInt(percentOffInput, 10)
    const maxUses = maxUsesInput.trim() ? Number.parseInt(maxUsesInput, 10) : null
    const expiresAt = parseDateInput(expiresAtInput)

    startTransition(async () => {
      const result = discount
        ? await updateDiscountAction({ id: discount.id, code, percentOff, maxUses, expiresAt })
        : await createDiscountAction({ code, percentOff, maxUses, expiresAt })

      if (result.ok) {
        // Routed through `handleOpenChange`, not a bare `setOpen(false)` —
        // that's what runs `resetFields()`. Without it, a successful create
        // left the just-submitted values sitting in state, so reopening
        // "New discount" came back prefilled with the code just created and
        // re-submitting hit the duplicate-code error.
        handleOpenChange(false)
        router.refresh()
        return
      }
      setError(result.error || GENERIC_ERROR)
    })
  }

  return (
    <>
      <Button type="button" variant={discount ? 'outline' : 'default'} size={discount ? 'sm' : 'default'} onClick={() => setOpen(true)}>
        {discount ? 'Edit' : 'New discount'}
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{discount ? `Edit ${discount.code}` : 'New discount code'}</DialogTitle>
            <DialogDescription>
              {discount ? "Update this code's percentage, cap, or expiry." : 'A percentage-off code customers enter at checkout.'}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}

            <div className="flex flex-col gap-1">
              <Label htmlFor="df-code">Code</Label>
              <Input id="df-code" value={code} onChange={(e) => setCode(e.target.value)} disabled={pending} required />
            </div>

            <div className="flex flex-col gap-1">
              <Label htmlFor="df-percent-off">Percent off</Label>
              <Input
                id="df-percent-off"
                type="number"
                min={1}
                max={100}
                value={percentOffInput}
                onChange={(e) => setPercentOffInput(e.target.value)}
                disabled={pending}
                required
              />
            </div>

            <div className="flex flex-col gap-1">
              <Label htmlFor="df-max-uses">Max uses</Label>
              <Input
                id="df-max-uses"
                type="number"
                min={1}
                value={maxUsesInput}
                onChange={(e) => setMaxUsesInput(e.target.value)}
                disabled={pending}
                placeholder="Unlimited"
              />
            </div>

            <div className="flex flex-col gap-1">
              <Label htmlFor="df-expires-at">Expires</Label>
              <Input
                id="df-expires-at"
                type="date"
                value={expiresAtInput}
                onChange={(e) => setExpiresAtInput(e.target.value)}
                disabled={pending}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" disabled={pending} onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {discount ? 'Save changes' : 'Create code'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}

/**
 * Enable/disable control for one row. Archive-first, same as product
 * deletion in 8c: this only ever flips `active` — there is no delete
 * anywhere in this feature, so the merchant's record of a promotion's
 * performance is never destroyed.
 */
export function DiscountActiveToggle({ id, active }: { id: string; active: boolean }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | undefined>(undefined)

  function handleToggle() {
    setError(undefined)
    startTransition(async () => {
      const result = await setDiscountActiveAction(id, !active)
      if (result.ok) {
        router.refresh()
        return
      }
      setError(result.error || GENERIC_ERROR)
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button type="button" variant="outline" size="sm" disabled={pending} onClick={handleToggle}>
        {active ? 'Disable' : 'Enable'}
      </Button>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}
