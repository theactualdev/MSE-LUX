import { Button } from '@/components/ui/button'
import { CartLineItem } from '@/features/cart/components/cart-line-item'
import { CartSummary } from '@/features/cart/components/cart-summary'
import type { CartLine } from '@/features/cart/lib/lines'
import type { CartSummary as CartSummaryModel } from '@/features/cart/lib/summary'
import type { Contact, Address } from '@/features/checkout/schema'
import type { DiscountSummary } from '@/features/discounts/discount-math'

interface ReviewStepProps {
  contact: Contact
  address: Address
  /** Only the label is displayed here — the amount is already reflected in `summary`. */
  shippingMethod: { label: string }
  lines: CartLine[]
  /**
   * The SAME summary object `checkout-flow.tsx` hands to `OrderSummaryPanel`
   * — already discounted (including the `discount` member) when a code
   * applies. This component never derives its own totals, so the review
   * content and the sidebar can never disagree at the moment the customer
   * authorises payment.
   */
  summary: CartSummaryModel & { discount?: DiscountSummary }
  onPlaceOrder: () => void
}

/**
 * Read-only recap of the full order — contact, address, shipping method,
 * line items, and totals — with the final `Place order` action.
 */
export function ReviewStep({
  contact,
  address,
  shippingMethod,
  lines,
  summary,
  onPlaceOrder,
}: ReviewStepProps) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1 rounded-xl border border-border p-4">
        <h3 className="text-sm font-medium text-foreground">Contact</h3>
        <p className="text-sm text-muted-foreground">{contact.email}</p>
      </div>

      <div className="flex flex-col gap-1 rounded-xl border border-border p-4">
        <h3 className="text-sm font-medium text-foreground">Shipping address</h3>
        <div className="flex flex-col text-sm text-muted-foreground">
          <span className="text-foreground">{address.fullName}</span>
          <span>
            {address.line1}
            {address.line2 ? `, ${address.line2}` : ''}
          </span>
          <span>
            {address.city}, {address.state}, {address.country}
            {address.postalCode ? ` ${address.postalCode}` : ''}
          </span>
          <span>{address.phone}</span>
        </div>
      </div>

      <div className="flex items-center justify-between rounded-xl border border-border p-4">
        <h3 className="text-sm font-medium text-foreground">Shipping method</h3>
        <p className="text-sm text-muted-foreground">{shippingMethod.label}</p>
      </div>

      <div className="flex flex-col divide-y divide-border rounded-xl border border-border p-4">
        {lines.map((line) => (
          <CartLineItem
            key={`${line.product.id}::${line.variant?.id ?? ''}`}
            line={line}
            className="py-4 first:pt-0 last:pb-0"
          />
        ))}
      </div>

      <CartSummary summary={summary} className="rounded-xl border border-border p-4" />

      <Button type="button" className="w-full" onClick={onPlaceOrder}>
        Place order
      </Button>
    </div>
  )
}
