'use client'

import { Minus, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface QuantityStepperProps {
  value: number
  onChange: (value: number) => void
  /** Defaults to 1 — a shopper should never be able to step down to 0. */
  min?: number
  max?: number
  /** Used to build each control's accessible name, e.g. "Decrease quantity". Defaults to "quantity". */
  label?: string
  className?: string
}

/**
 * Accessible −/＋ quantity stepper. The numeric value is a controlled,
 * read-only display (not a text input a shopper could type an invalid value
 * into) — every change is clamped to `[min, max]` before `onChange` fires,
 * and each button disables itself once the bound is reached.
 */
export function QuantityStepper({ value, onChange, min = 1, max, label = 'quantity', className }: QuantityStepperProps) {
  const clamp = (next: number) => {
    let clamped = next
    if (clamped < min) clamped = min
    if (max !== undefined && clamped > max) clamped = max
    return clamped
  }

  const atMin = value <= min
  const atMax = max !== undefined && value >= max

  return (
    <div role="group" aria-label={label} className={cn('inline-flex items-center gap-3', className)}>
      <Button
        type="button"
        variant="outline"
        size="icon-xl"
        aria-label={`Decrease ${label}`}
        disabled={atMin}
        onClick={() => onChange(clamp(value - 1))}
      >
        <Minus aria-hidden="true" className="size-4" />
      </Button>

      <span
        role="status"
        aria-live="polite"
        className="min-w-8 text-center text-base font-medium tabular-nums text-foreground"
      >
        {value}
      </span>

      <Button
        type="button"
        variant="outline"
        size="icon-xl"
        aria-label={`Increase ${label}`}
        disabled={atMax}
        onClick={() => onChange(clamp(value + 1))}
      >
        <Plus aria-hidden="true" className="size-4" />
      </Button>
    </div>
  )
}
