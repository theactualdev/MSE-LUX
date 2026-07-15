import { formatMoney } from '@/lib/money'
import type { CartSummary as CartSummaryModel } from '@/features/cart/lib/summary'
import { cn } from '@/lib/utils'

interface CartSummaryProps {
  summary: CartSummaryModel
  className?: string
}

/** Order-total breakdown (subtotal/shipping/tax + emphasized total) shown in the cart drawer and checkout. */
export function CartSummary({ summary, className }: CartSummaryProps) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>Subtotal</span>
        <span>{formatMoney(summary.subtotal, 'en-NG')}</span>
      </div>
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>Shipping</span>
        <span>{formatMoney(summary.shipping, 'en-NG')}</span>
      </div>
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>Tax</span>
        <span>{formatMoney(summary.tax, 'en-NG')}</span>
      </div>
      <div className="mt-2 flex items-center justify-between border-t border-border pt-2 text-base font-medium text-foreground">
        <span>Total</span>
        <span>{formatMoney(summary.total, 'en-NG')}</span>
      </div>
    </div>
  )
}
