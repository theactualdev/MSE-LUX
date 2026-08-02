import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CartLineItem } from '@/features/cart/components/cart-line-item'
import { CartSummary } from '@/features/cart/components/cart-summary'
import { DiscountField } from '@/features/checkout/components/discount-field'
import type { AppliedDiscount, DiscountSummary } from '@/features/discounts/discount-math'
import type { CartLine } from '@/features/cart/lib/lines'
import type { CartSummary as CartSummaryModel } from '@/features/cart/lib/summary'
import { cn } from '@/lib/utils'

interface OrderSummaryPanelProps {
  lines: CartLine[]
  /**
   * Already the final, displayable summary — including the `discount` member
   * when one applies. `checkout-flow.tsx` computes this ONCE (via its own
   * `applyDiscount`, the same formula `placeOrder` charges) and hands the
   * SAME object to this panel and to `ReviewStep`, so the two can never show
   * different totals. This component does no discount arithmetic of its
   * own — it only renders what it is given.
   */
  summary: CartSummaryModel & { discount?: DiscountSummary }
  /** Only the label is displayed here — the amount is already reflected in `summary`. */
  shippingMethod?: { label: string }
  /** The currently applied code (or none) — reported upward by `DiscountField` via `onDiscountChange`. Controls only the field's own display; the totals below come entirely from `summary`. */
  discount?: AppliedDiscount | null
  onDiscountChange: (discount: AppliedDiscount | null) => void
  className?: string
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

        <CartSummary summary={summary} className="border-t border-border pt-4" />
      </CardContent>
    </Card>
  )
}
