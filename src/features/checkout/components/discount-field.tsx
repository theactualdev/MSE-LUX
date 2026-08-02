'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { validateDiscountCode } from '@/features/discounts/actions'
import type { AppliedDiscount } from '@/features/discounts/discount-math'

interface DiscountFieldProps {
  value: AppliedDiscount | null
  onChange: (discount: AppliedDiscount | null) => void
}

/**
 * Checkout discount-code entry: an input + Apply button, and — once applied
 * — the code (with its percentage) and a Remove control. It holds
 * `{ code, percentOff } | null` and reports it upward via `onChange`.
 *
 * It NEVER computes a displayed price itself — it only reports the
 * percentage; the summary derives the display figure from
 * `computeDiscountMinor` (`@/features/discounts/discount-math`), the same
 * function `placeOrder` uses server-side, so the preview and the eventual
 * charge can never drift apart.
 *
 * `validateDiscountCode` is a checkout PREVIEW only (see that action's own
 * doc comment) — `placeOrder` re-resolves the code and re-derives the amount
 * server-side, so nothing this component reports is ever trusted as a price
 * input, only as a code to re-check. Every rejection reason comes back as the
 * SAME generic message (an enumeration guard on the server side) — this
 * component surfaces it as-is rather than trying to interpret it.
 *
 * The `role="status"` region is mounted UNCONDITIONALLY from first render —
 * only its text content ever changes afterward — because a live region that
 * appears already populated, or that pops in and out of the DOM, is
 * frequently not announced by screen readers (same idiom as
 * `NewsletterForm`/`SharePanel`).
 */
export function DiscountField({ value, onChange }: DiscountFieldProps) {
  const [input, setInput] = useState('')
  const [validating, setValidating] = useState(false)
  const [status, setStatus] = useState('')

  async function handleApply() {
    const code = input.trim()
    if (!code) return

    setValidating(true)
    setStatus('')

    const result = await validateDiscountCode(code)

    setValidating(false)

    if (!result.ok) {
      setStatus(result.error)
      return
    }

    setInput('')
    setStatus(`${result.code} applied — ${result.percentOff}% off.`)
    onChange({ code: result.code, percentOff: result.percentOff })
  }

  function handleRemove() {
    onChange(null)
    setStatus('Discount removed.')
  }

  return (
    <div className="flex flex-col gap-2">
      {value ? (
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-foreground">
            {value.code} (−{value.percentOff}%)
          </span>
          <Button type="button" variant="outline" size="sm" onClick={handleRemove}>
            Remove
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="discount-code">Discount code</Label>
          <div className="flex gap-2">
            <Input
              id="discount-code"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              disabled={validating}
              placeholder="Enter code"
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  handleApply()
                }
              }}
            />
            <Button
              type="button"
              variant="outline"
              className="shrink-0"
              disabled={validating || !input.trim()}
              onClick={handleApply}
            >
              Apply
            </Button>
          </div>
        </div>
      )}
      <div role="status" className="text-sm text-muted-foreground">
        {status}
      </div>
    </div>
  )
}
