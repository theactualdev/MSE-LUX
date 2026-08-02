import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CartLineItem } from '@/features/cart/components/cart-line-item'
import { CartSummary } from '@/features/cart/components/cart-summary'
import { DiscountField } from '@/features/checkout/components/discount-field'
import { computeDiscountMinor, type AppliedDiscount, type DiscountSummary } from '@/features/discounts/discount-math'
import { TAX_RATE } from '@/features/cart/lib/shipping'
import type { CartLine } from '@/features/cart/lib/lines'
import type { CartSummary as CartSummaryModel } from '@/features/cart/lib/summary'
import { cn } from '@/lib/utils'

interface OrderSummaryPanelProps {
  lines: CartLine[]
  summary: CartSummaryModel
  /** Only the label is displayed here — the amount is already reflected in `summary`. */
  shippingMethod?: { label: string }
  /** The currently applied code (or none) — reported upward by `DiscountField` via `onDiscountChange`. */
  discount?: AppliedDiscount | null
  onDiscountChange: (discount: AppliedDiscount | null) => void
  className?: string
}

/**
 * Applies `discount` to `summary` using the EXACT SAME formula `placeOrder`
 * charges: tax on the discounted subtotal, `total = subtotal - discount +
 * shipping + tax` (see `computeDiscountMinor`'s doc comment for why sharing
 * that one function — not re-implementing the arithmetic — is what keeps
 * this preview and the eventual server charge from drifting apart).
 *
 * Renders no `discount` member at all when the computed amount is zero — a
 * code string alone is never the render condition, only `discountMinor > 0`
 * is (mirrors the same rule `mapOrderRow` applies post-purchase).
 */
function applyDiscount(
  summary: CartSummaryModel,
  discount: AppliedDiscount | null | undefined,
): CartSummaryModel & { discount?: DiscountSummary } {
  if (!discount) return summary

  const currency = summary.subtotal.currency
  const discountMinor = computeDiscountMinor(summary.subtotal.amountMinor, discount.percentOff)
  if (discountMinor <= 0) return summary

  const discountedSubtotalMinor = summary.subtotal.amountMinor - discountMinor
  const taxMinor = Math.round(discountedSubtotalMinor * TAX_RATE)
  const totalMinor = discountedSubtotalMinor + summary.shipping.amountMinor + taxMinor

  return {
    ...summary,
    tax: { amountMinor: taxMinor, currency },
    total: { amountMinor: totalMinor, currency },
    discount: { code: discount.code, percentOff: discount.percentOff, amount: { amountMinor: discountMinor, currency } },
  }
}

/**
 * Persistent, read-only order summary shown alongside the checkout steps:
 * a compact (non-editable) line list, the chosen shipping method, the
 * discount-code entry, and the subtotal/discount/shipping/tax/total
 * breakdown.
 */
export function OrderSummaryPanel({
  lines,
  summary,
  shippingMethod,
  discount,
  onDiscountChange,
  className,
}: OrderSummaryPanelProps) {
  const effectiveSummary = applyDiscount(summary, discount)

  return (
    <Card className={cn(className)}>
      <CardHeader>
        <CardTitle>Order summary</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col divide-y divide-border">
          {lines.map((line) => (
            <CartLineItem
              key={`${line.product.id}::${line.variant?.id ?? ''}`}
              line={line}
              className="py-4 first:pt-0 last:pb-0"
            />
          ))}
        </div>

        {shippingMethod ? (
          <div className="flex items-center justify-between border-t border-border pt-4 text-sm text-muted-foreground">
            <span>Shipping method</span>
            <span className="text-foreground">{shippingMethod.label}</span>
          </div>
        ) : null}

        <div className="border-t border-border pt-4">
          <DiscountField value={discount ?? null} onChange={onDiscountChange} />
        </div>

        <CartSummary summary={effectiveSummary} className="border-t border-border pt-4" />
      </CardContent>
    </Card>
  )
}
