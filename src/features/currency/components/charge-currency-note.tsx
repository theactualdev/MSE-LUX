import { isFxDerived } from '@/features/currency/lib/currencies'
import type { Currency } from '@/types/money'

interface ChargeCurrencyNoteProps {
  currency: Currency
}

/** Discloses that FX-derived display prices are estimates and the actual charge is in US dollars. Renders nothing for authored currencies. */
export function ChargeCurrencyNote({ currency }: ChargeCurrencyNoteProps) {
  if (!isFxDerived(currency)) return null

  return (
    <p className="text-xs text-muted-foreground">
      {`Prices shown in ${currency} are estimates — you'll be charged in US$.`}
    </p>
  )
}
