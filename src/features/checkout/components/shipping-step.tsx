'use client'

import { useState } from 'react'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { formatMoney } from '@/lib/money/format'
import type { ShippingOption } from '@/features/checkout/shipping-types'
import { cn } from '@/lib/utils'

interface ShippingStepProps {
  options: ShippingOption[]
  loading?: boolean
  defaultId?: string
  onSelect: (option: ShippingOption) => void
}

/**
 * Shipping-option picker: a labelled radio group over the live, server-signed
 * `options` (label, estimated delivery window, and rate via `formatMoney`)
 * plus a `Continue` button that reports the chosen option (including its
 * verification `token`) via `onSelect`. While `loading` (options are still
 * being fetched from `getShippingRates`), shows skeleton rows instead of the
 * radios.
 */
export function ShippingStep({ options, loading, defaultId, onSelect }: ShippingStepProps) {
  const [selectedId, setSelectedId] = useState(defaultId ?? options[0]?.id)

  if (loading) {
    return (
      <div className="flex flex-col gap-4" role="status" aria-live="polite" aria-label="Loading shipping options">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-xl" />
        ))}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <RadioGroup
        aria-label="Shipping method"
        value={selectedId}
        onValueChange={(value) => setSelectedId(value as string)}
      >
        {options.map((option) => (
          <label
            key={option.id}
            className={cn(
              'flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-border p-4 transition-colors',
              selectedId === option.id && 'border-accent bg-accent/5',
            )}
          >
            <span className="flex items-center gap-3">
              <RadioGroupItem value={option.id} />
              <span className="flex flex-col">
                <span className="text-sm font-medium text-foreground">{option.label}</span>
                {option.deliveryEta ? (
                  <span className="text-xs text-muted-foreground">{option.deliveryEta}</span>
                ) : null}
              </span>
            </span>
            <span className="text-sm font-medium text-foreground">
              {formatMoney({ amountMinor: option.amountMinor, currency: option.currency })}
            </span>
          </label>
        ))}
      </RadioGroup>

      <Button
        type="button"
        className="mt-2 w-full"
        onClick={() => {
          const option = options.find((o) => o.id === selectedId) ?? options[0]
          if (option) onSelect(option)
        }}
      >
        Continue
      </Button>
    </div>
  )
}
