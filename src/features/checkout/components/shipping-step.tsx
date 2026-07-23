'use client'

import { useState } from 'react'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Button } from '@/components/ui/button'
import { formatMoney } from '@/lib/money'
import type { ShippingMethod } from '@/features/cart/lib/shipping'
import { cn } from '@/lib/utils'

interface ShippingStepProps {
  methods: ShippingMethod[]
  defaultValue?: ShippingMethod
  onSelect: (method: ShippingMethod) => void
}

/**
 * Shipping-method picker: a labelled radio group over `methods` (label,
 * estimated delivery window, and rate via `formatMoney`) plus a `Continue`
 * button that reports the chosen method via `onSelect`.
 */
export function ShippingStep({ methods, defaultValue, onSelect }: ShippingStepProps) {
  const [selectedId, setSelectedId] = useState(defaultValue?.id ?? methods[0]?.id)

  return (
    <div className="flex flex-col gap-4">
      <RadioGroup
        aria-label="Shipping method"
        value={selectedId}
        onValueChange={(value) => setSelectedId(value as string)}
      >
        {methods.map((method) => (
          <label
            key={method.id}
            className={cn(
              'flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-border p-4 transition-colors',
              selectedId === method.id && 'border-accent bg-accent/5',
            )}
          >
            <span className="flex items-center gap-3">
              <RadioGroupItem value={method.id} />
              <span className="flex flex-col">
                <span className="text-sm font-medium text-foreground">{method.label}</span>
                {method.estimatedDays ? (
                  <span className="text-xs text-muted-foreground">{method.estimatedDays}</span>
                ) : null}
              </span>
            </span>
            <span className="text-sm font-medium text-foreground">
              {formatMoney(method.amount)}
            </span>
          </label>
        ))}
      </RadioGroup>

      <Button
        type="button"
        className="mt-2 w-full"
        onClick={() => {
          const method = methods.find((m) => m.id === selectedId) ?? methods[0]
          if (method) onSelect(method)
        }}
      >
        Continue
      </Button>
    </div>
  )
}
