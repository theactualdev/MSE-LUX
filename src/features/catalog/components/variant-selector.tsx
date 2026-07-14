'use client'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { OptionValue, Product, ProductVariant } from '@/types/catalog'

/** Currently selected value per option-type name, e.g. { Size: '18cm' }. */
export type OptionState = Record<string, string>

export interface VariantSelectorChange {
  options: OptionValue[]
  variant: ProductVariant | undefined
}

interface VariantSelectorProps {
  product: Product
  /** Controlled: the option values selected so far (may be partial). */
  optionState: OptionState
  onChange: (change: VariantSelectorChange) => void
  className?: string
}

/**
 * Finds the variant whose options exactly match every currently-selected
 * option type. Returns undefined until a value has been chosen for each
 * option type the product defines.
 */
function findMatchingVariant(product: Product, optionState: OptionState): ProductVariant | undefined {
  if (product.optionTypes.some((optionType) => !optionState[optionType.name])) return undefined
  return product.variants.find((variant) =>
    product.optionTypes.every(
      (optionType) =>
        variant.options.find((option) => option.name === optionType.name)?.value === optionState[optionType.name],
    ),
  )
}

/**
 * Whether at least one in-stock variant is reachable from the current
 * selection plus this candidate value — i.e. clicking it wouldn't strand the
 * shopper on a combination with zero inventory. Unselected option types are
 * left unconstrained, so this also works before every group has a choice.
 */
function isValueAvailable(product: Product, optionState: OptionState, optionName: string, value: string): boolean {
  const candidate: OptionState = { ...optionState, [optionName]: value }
  return product.variants.some(
    (variant) =>
      variant.inventory > 0 &&
      product.optionTypes.every((optionType) => {
        const wanted = candidate[optionType.name]
        if (wanted === undefined) return true
        return variant.options.find((option) => option.name === optionType.name)?.value === wanted
      }),
  )
}

/**
 * One labelled control group per `product.optionTypes` entry (e.g. Size,
 * Color), rendered as accessible toggle-button chips. Selection is fully
 * controlled by the parent via `optionState` — this component only reports
 * changes and the resolved variant, it holds no state of its own.
 */
export function VariantSelector({ product, optionState, onChange, className }: VariantSelectorProps) {
  if (product.optionTypes.length === 0) return null

  const handleSelect = (optionName: string, value: string) => {
    const nextState: OptionState = { ...optionState, [optionName]: value }
    const options: OptionValue[] = Object.entries(nextState).map(([name, val]) => ({ name, value: val }))
    onChange({ options, variant: findMatchingVariant(product, nextState) })
  }

  return (
    <div className={cn('flex flex-col gap-6', className)}>
      {product.optionTypes.map((optionType) => (
        <fieldset key={optionType.name} className="flex flex-col gap-3">
          <legend className="text-sm font-medium text-foreground">{optionType.name}</legend>
          <div className="flex flex-wrap gap-2">
            {optionType.values.map((value) => {
              const selected = optionState[optionType.name] === value
              const available = isValueAvailable(product, optionState, optionType.name, value)
              return (
                <Button
                  key={value}
                  type="button"
                  variant={selected ? 'default' : 'outline'}
                  aria-pressed={selected}
                  disabled={!available}
                  aria-label={available ? value : `${value} (out of stock)`}
                  onClick={() => handleSelect(optionType.name, value)}
                >
                  <span className={cn(!available && 'line-through')}>{value}</span>
                </Button>
              )
            })}
          </div>
        </fieldset>
      ))}
    </div>
  )
}
