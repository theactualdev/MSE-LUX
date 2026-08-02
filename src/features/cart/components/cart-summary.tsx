import { formatMoney } from '@/lib/money'
import type { CartSummary as CartSummaryModel } from '@/features/cart/lib/summary'
import type { DiscountSummary } from '@/features/discounts/discount-math'
import { cn } from '@/lib/utils'

interface CartSummaryProps {
  /**
   * `discount` is optional and, when present, is always the ALREADY-COMPUTED
   * amount (never re-derived here) — `order-summary-panel.tsx`'s live
   * checkout preview and `order-view.ts`'s `mapOrderRow` (post-purchase) are
   * the two producers, both via `computeDiscountMinor`, and both already
   * enforce "only set `discount` when its amount is > 0". This one component
   * renders both the checkout review step's summary AND the order
   * confirmation page's summary (via `OrderConfirmation`), so this single
   * `summary.discount` check is what makes the row appear consistently on
   * both surfaces.
   */
  summary: CartSummaryModel & { discount?: DiscountSummary }
  className?: string
}

/** Order-total breakdown (subtotal/discount/shipping/tax + emphasized total) shown in the cart drawer, checkout, and order confirmation. */
export function CartSummary({ summary, className }: CartSummaryProps) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>Subtotal</span>
        <span>{formatMoney(summary.subtotal)}</span>
      </div>
      {summary.discount ? (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{`Discount (${summary.discount.code} −${summary.discount.percentOff}%)`}</span>
          <span>{`−${formatMoney(summary.discount.amount)}`}</span>
        </div>
      ) : null}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>Shipping</span>
        <span>{formatMoney(summary.shipping)}</span>
      </div>
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>Tax</span>
        <span>{formatMoney(summary.tax)}</span>
      </div>
      <div className="mt-2 flex items-center justify-between border-t border-border pt-2 text-base font-medium text-foreground">
        <span>Total</span>
        <span>{formatMoney(summary.total)}</span>
      </div>
    </div>
  )
}
