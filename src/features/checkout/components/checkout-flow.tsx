'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ShoppingBag } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ContactStep } from '@/features/checkout/components/contact-step'
import { AddressStep } from '@/features/checkout/components/address-step'
import { ShippingStep } from '@/features/checkout/components/shipping-step'
import { PaymentStep } from '@/features/checkout/components/payment-step'
import { ReviewStep } from '@/features/checkout/components/review-step'
import { OrderSummaryPanel } from '@/features/checkout/components/order-summary-panel'
import { useLastOrderStore } from '@/features/checkout/store'
import { placeOrder } from '@/features/checkout/data'
import { getShippingRates } from '@/features/checkout/shipping'
import { initializePayment, verifyPayment } from '@/features/checkout/payments'
import { useCart } from '@/features/cart/use-cart'
import { useHydrated } from '@/features/cart/use-hydrated'
import { computeCartSummary } from '@/features/cart/lib/summary'
import { TAX_RATE } from '@/features/cart/lib/shipping'
import { computeDiscountMinor } from '@/features/discounts/discount-math'
import { formatMoney } from '@/lib/money'
import type { Contact, Address } from '@/features/checkout/schema'
import type { ShippingOption } from '@/features/checkout/shipping-types'
import type { CartSummary as CartSummaryModel } from '@/features/cart/lib/summary'
import type { AppliedDiscount, DiscountSummary } from '@/features/discounts/discount-math'
import type { OrderView } from '@/features/checkout/lib/order-view'
import { cn } from '@/lib/utils'

type Step = 'contact' | 'address' | 'shipping' | 'payment' | 'review'

const STEP_ORDER: Step[] = ['contact', 'address', 'shipping', 'payment', 'review']

const STEP_LABELS: Record<Step, string> = {
  contact: 'Contact',
  address: 'Shipping address',
  shipping: 'Shipping method',
  payment: 'Payment',
  review: 'Review',
}

/**
 * Multi-step guest checkout orchestrator: contact → address → shipping →
 * payment (Paystack) → review. Holds the current step and the data collected
 * at each step, and renders a persistent, read-only `<OrderSummaryPanel>`
 * alongside the active step (using the selected shipping option, if any —
 * there is no shipping to summarize before the address step's live rates
 * come back).
 *
 * Right after the address step, `getShippingRates` fetches live, server-
 * signed shipping options for that address (and the guest/cart lines) and
 * the flow advances to the shipping step with them already populated,
 * defaulting to the first option. The chosen option's opaque `token` — never
 * its `amountMinor` — is what `placeOrder` receives; the server derives the
 * charged shipping amount from that verified token, not from anything this
 * component sends as a number.
 *
 * Gated on `useHydrated` so the persisted cart is never read before the
 * client has hydrated (avoids a server/client mismatch), and on
 * `useCart().isLoading` so the async server-backed `lines` resolution
 * doesn't flash the empty state first. If the cart is empty, shows an empty
 * state linking back to `/` instead of the flow.
 *
 * On `Place order`, `handlePlaceOrder` places a PENDING order via the
 * `placeOrder` server action. If a discount code rode along and what came
 * back (`placed.order.summary.discount`) is absent or carries a different
 * `percentOff` than what was sent, the code changed underneath the customer
 * between the checkout preview and this call — `handlePlaceOrder` does NOT
 * proceed straight to payment in that case. It shows a `changedTotal` state
 * with the real total and requires an explicit confirm
 * (`handleConfirmChangedTotal`) before payment starts. Either way, payment
 * itself is `proceedToPayment`: it initializes a Paystack transaction for
 * the ALREADY-PLACED order (`initializePayment`, which derives the amount
 * from the stored order — never a client value) and opens the Paystack
 * inline popup with the returned access code. The popup's `onSuccess` is
 * only a fast-path hint — the order isn't trusted paid until the server
 * `verifyPayment` call confirms it (the webhook is the backstop if that call
 * never lands). Critically, `proceedToPayment` takes the already-placed
 * `OrderView`, never calling `placeOrder` a second time — from either the
 * happy path or the changed-total confirm — so a second PENDING row is
 * never created for the same checkout attempt.
 *
 * `saveAddress` — whether the address step's "save this address to my
 * account" checkbox was checked — is captured from `AddressStep`'s `onSubmit`
 * alongside the address itself, and rides along in the `placeOrder` call.
 * It's opt-in UI sugar only: `placeOrder` treats the save-back as best-effort
 * and it can never affect order placement (see that function's doc comment).
 *
 * `discount` (Phase 10b) is held here as `{ code, percentOff } | null`,
 * reported up by `DiscountField` (rendered inside `OrderSummaryPanel`). The
 * discounted preview total is derived from it ONCE here, via `applyDiscount`
 * below, into a single `summary` value that both `ReviewStep` and
 * `OrderSummaryPanel` are handed — never re-derived per component — so the
 * review step's main content and its sidebar can never disagree about the
 * total at the moment the customer authorises payment. Only `discount?.code`
 * — never the percentage or any computed amount — rides along in the
 * `placeOrder` call; the server re-resolves the code and re-derives the
 * charged discount itself.
 */

/**
 * Applies `discount` to `summary` using the EXACT SAME formula `placeOrder`
 * charges: tax on the discounted subtotal, `total = subtotal - discount +
 * shipping + tax` (see `computeDiscountMinor`'s doc comment for why sharing
 * that one function — not re-implementing the arithmetic — is what keeps
 * this preview and the eventual server charge from drifting apart).
 *
 * Called ONCE per render, here in `CheckoutFlow`, so there is exactly one
 * computed summary at the review step and every panel renders that same
 * object — no sibling component derives its own discounted total.
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

export function CheckoutFlow({
  initialContact,
  initialAddress,
  isSignedIn = false,
}: {
  initialContact?: Contact
  initialAddress?: Address
  /** Threaded down to `AddressStep`, which renders the "save to account" checkbox only for a signed-in caller. */
  isSignedIn?: boolean
}) {
  const router = useRouter()
  const hydrated = useHydrated()
  const { lines, clear, isLoading, chargeCurrency } = useCart()

  const [step, setStep] = useState<Step>('contact')
  const [contact, setContact] = useState<Contact | undefined>(initialContact)
  const [address, setAddress] = useState<Address | undefined>(initialAddress)
  const [saveAddress, setSaveAddress] = useState(false)
  const [shippingOptions, setShippingOptions] = useState<ShippingOption[]>([])
  const [selectedShipping, setSelectedShipping] = useState<ShippingOption>()
  const [shippingLoading, setShippingLoading] = useState(false)
  const [shippingError, setShippingError] = useState<string>()
  const [placing, setPlacing] = useState(false)
  const [error, setError] = useState<string>()
  const [discount, setDiscount] = useState<AppliedDiscount | null>(null)
  // Set ONLY when `placeOrder` succeeded but the discount that was sent came
  // back missing or changed (see `handlePlaceOrder`'s doc comment) — the
  // order is ALREADY placed at this point, so this state's `order` is what
  // `handleConfirmChangedTotal` resumes payment for, never a fresh `placeOrder`.
  const [changedTotal, setChangedTotal] = useState<{ order: OrderView; message: string } | undefined>()

  if (!hydrated || isLoading) {
    return (
      <div className="flex flex-col gap-10 lg:flex-row lg:items-start" aria-hidden="true">
        <Skeleton className="h-96 flex-1 rounded-xl" />
        <Skeleton className="h-56 w-full rounded-xl lg:w-80 lg:shrink-0" />
      </div>
    )
  }

  // Once the order is being placed we clear the cart (which empties `lines`)
  // and navigate to the confirmation page. Show a placing state until the
  // navigation lands, so the now-empty cart doesn't flash "your bag is empty"
  // between `clear()` and the route change.
  if (placing) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center" role="status" aria-live="polite">
        <ShoppingBag aria-hidden="true" className="size-10 animate-pulse text-muted-foreground" />
        <h2 className="font-display text-xl font-medium text-foreground">Placing your order…</h2>
        <p className="max-w-sm text-sm text-muted-foreground">Hang tight while we confirm your order.</p>
      </div>
    )
  }

  // The order is ALREADY placed at this point (see `handlePlaceOrder`) — this
  // is a required confirm before payment, never a step the customer can
  // silently skip past into the Paystack popup.
  if (changedTotal) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center" role="alert" aria-live="assertive">
        <ShoppingBag aria-hidden="true" className="size-10 text-muted-foreground" />
        <h2 className="font-display text-xl font-medium text-foreground">Your total has changed</h2>
        <p className="max-w-sm text-sm text-muted-foreground">{changedTotal.message}</p>
        <Button type="button" className="mt-3" onClick={handleConfirmChangedTotal}>
          Continue to payment
        </Button>
      </div>
    )
  }

  if (lines.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <ShoppingBag aria-hidden="true" className="size-10 text-muted-foreground" />
        <h2 className="font-display text-xl font-medium text-foreground">Your bag is empty</h2>
        <p className="max-w-sm text-sm text-muted-foreground">
          Add something to your bag before checking out.
        </p>
        <Link href="/" className={cn(buttonVariants(), 'mt-3')}>
          Continue shopping
        </Link>
      </div>
    )
  }

  const cartSummary = computeCartSummary(
    lines,
    { amountMinor: selectedShipping?.amountMinor ?? 0, currency: chargeCurrency },
    chargeCurrency,
  )
  // Computed ONCE here — the review step's main content and its sidebar are
  // both handed this exact object, so they can never show two different
  // totals at the moment the customer authorises payment.
  const summary = applyDiscount(cartSummary, discount)

  /**
   * Initializes payment for an ALREADY-PLACED order and opens the Paystack
   * popup. Split out from `handlePlaceOrder` so the changed-total confirm
   * path (`handleConfirmChangedTotal`) can resume payment for the order
   * `placeOrder` already returned, rather than placing a second one — a
   * second `placeOrder` call here would leave the first PENDING row orphaned.
   */
  async function proceedToPayment(order: OrderView) {
    const init = await initializePayment(order.orderNumber)

    if (!('ok' in init)) {
      setPlacing(false)
      setError(init.error)
      return
    }

    // Dynamically imported so the Paystack SDK never reaches the initial
    // bundle and SSR never touches it.
    const { default: Paystack } = await import('@paystack/inline-js')
    const popup = new Paystack()

    popup.resumeTransaction(init.accessCode, {
      onSuccess: async (transaction: { reference: string }) => {
        const verified = await verifyPayment(transaction.reference)

        if ('ok' in verified) {
          // Flip to the placing state BEFORE clearing the cart, so the
          // empty-bag state can't render in the gap before the navigation
          // completes.
          useLastOrderStore.getState().setOrder(order)
          clear()

          // `verified.status === 'processing'` (Phase 6 finding B) means
          // fulfilment hit an unexpected error on this fast path — the order
          // IS placed and paid (Paystack confirmed the charge), so it still
          // navigates and clears the cart exactly like 'paid', but the
          // webhook, not this call, is what will actually fulfil it. The
          // confirmation page must not claim the order is confirmed yet; the
          // `status` query flag is how that distinction survives the
          // navigation (never inferred from the order snapshot itself, which
          // has no `paidAt`/status field to gate on).
          const statusQuery = verified.status === 'processing' ? '?status=processing' : ''
          router.push(`/order/${order.orderNumber}${statusQuery}`)
        } else {
          setPlacing(false)
          setError(verified.error)
        }
      },
      onCancel: () => setPlacing(false),
      onError: () => {
        setPlacing(false)
        setError('Payment could not be completed. Please try again.')
      },
    })
  }

  async function handlePlaceOrder() {
    if (!contact || !address || !selectedShipping) return

    setError(undefined)
    setChangedTotal(undefined)
    setPlacing(true)

    const placed = await placeOrder({
      contact,
      address,
      shippingToken: selectedShipping.token,
      chargeCurrency,
      guestLines: lines.map((line) => ({
        productId: line.product.id,
        variantId: line.variant?.id,
        quantity: line.quantity,
      })),
      saveAddress,
      // The code only — never a percentage or amount. `placeOrder`
      // re-resolves it and re-derives the discount server-side; see
      // `PlaceOrderInput.discountCode`'s doc comment.
      discountCode: discount?.code,
    })

    if (!('ok' in placed)) {
      setPlacing(false)
      setError(placed.error)
      return
    }

    // `placeOrder` places at full price (never fails the order) when a code
    // sent along with it turns out to be invalid, disabled, or changed
    // between the checkout preview and this call — see that function's own
    // doc comment. The order is ALREADY written at this point (a fact, not a
    // draft), so silently opening the Paystack popup on a higher total than
    // what the review step just showed would charge the customer without
    // ever telling them why. Compare what was SENT (`discount`, this
    // component's own state) against what came BACK
    // (`placed.order.summary.discount`, the server's re-derived truth): a
    // discount sent with no returned discount, or a returned `percentOff`
    // that differs from what was sent, means the total the customer is about
    // to be charged is NOT the one they reviewed — stop short of the popup
    // and require an explicit confirm before proceeding. When nothing
    // changed (including when no discount was ever sent), fall straight
    // through to payment exactly as before.
    if (discount) {
      const returnedDiscount = placed.order.summary.discount

      if (!returnedDiscount || returnedDiscount.percentOff !== discount.percentOff) {
        setPlacing(false)
        setChangedTotal({
          order: placed.order,
          message: returnedDiscount
            ? `The code ${discount.code} now gives ${returnedDiscount.percentOff}% off — your total is now ${formatMoney(placed.order.summary.total)}.`
            : `The code ${discount.code} is no longer available — your total is now ${formatMoney(placed.order.summary.total)}.`,
        })
        return
      }
    }

    await proceedToPayment(placed.order)
  }

  /**
   * The customer's explicit confirm from the changed-total state. Resumes
   * payment for `changedTotal.order` — the order `placeOrder` already
   * returned — rather than calling `placeOrder` again, which would create a
   * second PENDING order and orphan the first.
   */
  async function handleConfirmChangedTotal() {
    if (!changedTotal) return

    const order = changedTotal.order
    setChangedTotal(undefined)
    setPlacing(true)
    await proceedToPayment(order)
  }

  return (
    <div className="flex flex-col gap-10 lg:flex-row lg:items-start">
      <div className="flex flex-1 flex-col gap-6">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Step {STEP_ORDER.indexOf(step) + 1} of {STEP_ORDER.length} — {STEP_LABELS[step]}
        </p>

        {step === 'contact' ? (
          <ContactStep
            defaultValues={contact}
            onSubmit={(values) => {
              setContact(values)
              setStep('address')
            }}
          />
        ) : null}

        {step === 'address' ? (
          <div className="flex flex-col gap-4">
            {shippingError ? (
              <p role="alert" className="text-sm text-destructive">
                {shippingError}
              </p>
            ) : null}
            <AddressStep
              defaultValues={address}
              isSignedIn={isSignedIn}
              onSubmit={async (values, checkedSaveAddress) => {
                if (!contact) return

                setAddress(values)
                setSaveAddress(checkedSaveAddress)
                setShippingLoading(true)
                setShippingError(undefined)

                const opts = await getShippingRates({
                  address: values,
                  email: contact.email,
                  chargeCurrency,
                  guestLines: lines.map((line) => ({
                    productId: line.product.id,
                    variantId: line.variant?.id,
                    quantity: line.quantity,
                  })),
                })

                setShippingLoading(false)

                // `getShippingRates` never throws, but an empty array means
                // it couldn't build even its own last-resort fallback option
                // (e.g. a missing signing secret) — there is nothing
                // selectable. Advancing to the shipping step anyway would
                // strand the customer on a step with no options and no way
                // to select one; stay on the address step and surface an
                // inline, retryable message instead.
                if (opts.length === 0) {
                  setShippingError('Shipping options are temporarily unavailable. Please try again in a moment.')
                  return
                }

                setShippingOptions(opts)
                setSelectedShipping(opts[0])
                setStep('shipping')
              }}
            />
          </div>
        ) : null}

        {step === 'shipping' ? (
          <ShippingStep
            options={shippingOptions}
            loading={shippingLoading}
            defaultId={selectedShipping?.id}
            onSelect={(option) => {
              setSelectedShipping(option)
              setStep('payment')
            }}
          />
        ) : null}

        {step === 'payment' ? <PaymentStep onContinue={() => setStep('review')} /> : null}

        {step === 'review' && contact && address && selectedShipping ? (
          <div className="flex flex-col gap-4">
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <ReviewStep
              contact={contact}
              address={address}
              shippingMethod={selectedShipping}
              lines={lines}
              summary={summary}
              onPlaceOrder={handlePlaceOrder}
            />
          </div>
        ) : null}
      </div>

      <OrderSummaryPanel
        lines={lines}
        summary={summary}
        shippingMethod={selectedShipping}
        discount={discount}
        onDiscountChange={setDiscount}
        className="w-full lg:sticky lg:top-24 lg:w-80 lg:shrink-0"
      />
    </div>
  )
}
