import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CartLineItem } from '@/features/cart/components/cart-line-item'
import { CartSummary } from '@/features/cart/components/cart-summary'
import type { CartLine } from '@/features/cart/lib/lines'
import type { CartSummary as CartSummaryModel } from '@/features/cart/lib/summary'
import { cn } from '@/lib/utils'

interface OrderSummaryPanelProps {
  lines: CartLine[]
  summary: CartSummaryModel
  /** Only the label is displayed here — the amount is already reflected in `summary`. */
  shippingMethod?: { label: string }
  className?: string
}

/**
 * Persistent, read-only order summary shown alongside the checkout steps:
 * a compact (non-editable) line list, the chosen shipping method, and the
 * subtotal/shipping/tax/total breakdown.
 */
export function OrderSummaryPanel({ lines, summary, shippingMethod, className }: OrderSummaryPanelProps) {
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

        <CartSummary summary={summary} className="border-t border-border pt-4" />
      </CardContent>
    </Card>
  )
}
