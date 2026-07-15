'use client'

import { useState } from 'react'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type PaymentMethod = 'card' | 'bank-transfer' | 'cash-on-delivery'

const PAYMENT_OPTIONS: { id: PaymentMethod; label: string; description: string }[] = [
  { id: 'card', label: 'Card', description: 'Visa, Mastercard, Verve' },
  { id: 'bank-transfer', label: 'Bank transfer', description: 'Pay directly from your bank account' },
  { id: 'cash-on-delivery', label: 'Pay on delivery', description: 'Pay in cash when your order arrives' },
]

interface PaymentStepProps {
  defaultValue?: PaymentMethod
  onSelect: (method: PaymentMethod) => void
}

/**
 * Mock payment-method picker. This is a demo checkout: no payment gateway is
 * integrated, so this step collects only a method preference — never a card
 * number, expiry, or CVV — and says so plainly.
 */
export function PaymentStep({ defaultValue, onSelect }: PaymentStepProps) {
  const [selected, setSelected] = useState<PaymentMethod>(defaultValue ?? 'card')

  return (
    <div className="flex flex-col gap-4">
      <p className="rounded-xl border border-dashed border-border bg-muted px-4 py-3 text-sm text-muted-foreground">
        Demo checkout — no payment is processed and no card details are collected.
      </p>

      <RadioGroup
        aria-label="Payment method"
        value={selected}
        onValueChange={(value) => setSelected(value as PaymentMethod)}
      >
        {PAYMENT_OPTIONS.map((option) => (
          <label
            key={option.id}
            className={cn(
              'flex cursor-pointer items-center gap-3 rounded-xl border border-border p-4 transition-colors',
              selected === option.id && 'border-accent bg-accent/5',
            )}
          >
            <RadioGroupItem value={option.id} />
            <span className="flex flex-col">
              <span className="text-sm font-medium text-foreground">{option.label}</span>
              <span className="text-xs text-muted-foreground">{option.description}</span>
            </span>
          </label>
        ))}
      </RadioGroup>

      <Button type="button" className="mt-2 w-full" onClick={() => onSelect(selected)}>
        Continue to review
      </Button>
    </div>
  )
}
