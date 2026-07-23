'use client'

import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useDisplayCurrency, useSetCurrency } from '@/features/currency/context'
import { SUPPORTED_CURRENCIES } from '@/features/currency/lib/currencies'
import type { Currency } from '@/types/money'

/**
 * Compact header control that lets a visitor override the geo-detected
 * display currency. The trigger shows the active currency code; selecting a
 * different one calls `useSetCurrency`, which updates the context AND
 * persists the `mse-currency` cookie — this component never touches the
 * cookie directly.
 */
export function CurrencySwitcher() {
  const currency = useDisplayCurrency()
  const setCurrency = useSetCurrency()

  return (
    <Select value={currency} onValueChange={(value) => setCurrency(value as Currency)}>
      <SelectTrigger
        aria-label="Change currency"
        className="h-12 w-auto min-w-0 gap-1 rounded-xl border-transparent bg-transparent px-2.5 text-sm font-medium text-foreground hover:bg-muted data-[size=default]:h-12"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        <SelectGroup>
          {SUPPORTED_CURRENCIES.map((code) => (
            <SelectItem key={code} value={code}>
              {code}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}
