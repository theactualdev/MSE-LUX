'use client'

import { useState } from 'react'
import { Heart, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { ContactStep } from '@/features/checkout/components/contact-step'
import { getGiftShippingRates, placeGiftOrder } from '@/features/gifting/checkout-actions'
import { initializePayment, verifyPayment } from '@/features/checkout/payments'
import { useDisplayCurrency } from '@/features/currency/context'
import { chargeCurrencyFor } from '@/features/currency/lib/currencies'
import { formatMoney } from '@/lib/money/format'
import type { Contact } from '@/features/checkout/schema'
import type { ShippingOption } from '@/features/checkout/shipping-types'
import type { GiftSelectionItem } from '@/features/gifting/components/gift-selection'
import { cn } from '@/lib/utils'

type Step = 'email' | 'shipping' | 'confirmed'
type PaymentStatus = 'paid' | 'processing'

interface GiftCheckoutProps {
  /** The share token — spent against `getGiftShippingRates`/`placeGiftOrder`, never resolved to an address here. */
  token: string
  /** Parsed by the server page from the `selections` query param the share page navigated here with. */
  selections: GiftSelectionItem[]
  /** Buyer-safe recipient identity ONLY — never the recipient's street address. See module doc. */
  recipientFirstName: string
  city: string
}

/**
 * The gift buyer's checkout: email → live shipping rates → pick a rate → pay
 * via the same Paystack sequence the ordinary checkout uses. THERE IS NO
 * ADDRESS STEP — the destination is resolved server-side from the share
 * token by `getGiftShippingRates`/`placeGiftOrder` (see that module's doc
 * comment), and neither action takes one. The only delivery information this
 * component ever renders is `recipientFirstName` + `city`, both passed down
 * from the server page's own `resolveShare` call — `share.address` (the full
 * street address) is `server-only` and never reaches this client bundle at
 * all, so there is no address value here to accidentally render even by
 * mistake.
 *
 * `email` reuses the existing checkout's `ContactStep` rather than
 * duplicating a form — same validation, same field, same "Continue" affordance.
 * Submitting it calls `getGiftShippingRates`; an empty result (shipping
 * temporarily unavailable, mirroring `CheckoutFlow`'s address-step handling)
 * surfaces an inline, retryable error and keeps the buyer on the email step
 * rather than advancing to a step with nothing to pick.
 *
 * Shipping options render LABEL AND PRICE ONLY (no `deliveryEta`) — a
 * deliberate, narrower rendering than the ordinary checkout's `ShippingStep`,
 * matching the same "nothing beyond first name + city" posture as the rest of
 * this flow.
 *
 * `handlePay` is the same three-call sequence `CheckoutFlow.handlePlaceOrder`
 * uses — `placeGiftOrder` (an order-placing analogue of `placeOrder`),
 * `initializePayment`, then the dynamically-imported Paystack popup and
 * `verifyPayment` — reusing those exact actions rather than re-implementing
 * payment. There is no cart here to clear and no `useLastOrderStore` entry to
 * write: this component never imports `useCart`/`useCartStore`, because the
 * buyer's own cart has nothing to do with a gift order (see
 * `checkout-actions.ts`'s doc comment on why the gift rate/order builders
 * take explicit `lines`, never the buyer's cart).
 *
 * `verifyPayment`'s `status` (`'paid'` vs `'processing'`, same Phase 6
 * finding B distinction the ordinary checkout carries into
 * `OrderConfirmation` via its `?status=` query flag) is captured into
 * `paymentStatus` state and threaded into the confirmed step below —
 * `'processing'` means Paystack confirmed the charge but fulfilment hit an
 * unexpected error and is relying on the webhook backstop, so it must NOT
 * render the confident "your gift is on its way" copy; there is no order to
 * navigate to here (unlike the ordinary flow), so the distinction is made
 * entirely in this same confirmed-step render rather than via a query param.
 */
export function GiftCheckout({ token, selections, recipientFirstName, city }: GiftCheckoutProps) {
  const displayCurrency = useDisplayCurrency()
  const chargeCurrency = chargeCurrencyFor(displayCurrency)

  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [shippingOptions, setShippingOptions] = useState<ShippingOption[]>([])
  const [selectedShippingId, setSelectedShippingId] = useState<string>()
  const [loadingRates, setLoadingRates] = useState(false)
  const [placing, setPlacing] = useState(false)
  const [error, setError] = useState<string>()
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('paid')

  async function handleEmailContinue(contact: Contact) {
    setEmail(contact.email)
    setError(undefined)
    setLoadingRates(true)

    const options = await getGiftShippingRates({
      shareToken: token,
      selections,
      email: contact.email,
      chargeCurrency,
    })

    setLoadingRates(false)

    // `getGiftShippingRates` never throws, but an empty array means it
    // couldn't build even its own last-resort fallback option — there is
    // nothing selectable, so stay on the email step with a retryable message
    // rather than advancing to an empty shipping step.
    if (options.length === 0) {
      setError('Shipping options are temporarily unavailable. Please try again in a moment.')
      return
    }

    setShippingOptions(options)
    setSelectedShippingId(options[0].id)
    setStep('shipping')
  }

  async function handlePay() {
    const selected = shippingOptions.find((option) => option.id === selectedShippingId)
    if (!selected) return

    setError(undefined)
    setPlacing(true)

    const placed = await placeGiftOrder({
      shareToken: token,
      selections,
      email,
      chargeCurrency,
      shippingToken: selected.token,
    })

    if (!placed.ok) {
      setPlacing(false)
      setError(placed.error)
      return
    }

    const init = await initializePayment(placed.orderNumber)

    if (!('ok' in init)) {
      setPlacing(false)
      setError(init.error)
      return
    }

    // Dynamically imported so the Paystack SDK never reaches the initial
    // bundle and SSR never touches it — same reasoning as `CheckoutFlow`.
    const { default: Paystack } = await import('@paystack/inline-js')
    const popup = new Paystack()

    popup.resumeTransaction(init.accessCode, {
      onSuccess: async (transaction: { reference: string }) => {
        const verified = await verifyPayment(transaction.reference)

        if ('ok' in verified) {
          setPlacing(false)
          setPaymentStatus(verified.status)
          setStep('confirmed')
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

  if (step === 'confirmed') {
    const isProcessing = paymentStatus === 'processing'

    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center" role="status" aria-live="polite">
        {isProcessing ? (
          <Loader2 aria-hidden="true" className="size-10 animate-spin text-primary" />
        ) : (
          <Heart aria-hidden="true" className="size-10 text-accent" />
        )}
        {isProcessing ? (
          <h2 className="font-display text-xl font-medium text-foreground">
            Payment received — we&apos;re finalising your order
          </h2>
        ) : (
          <h2 className="font-display text-xl font-medium text-foreground">Your gift is on its way</h2>
        )}
        <p className="max-w-sm text-sm text-muted-foreground">
          Delivering to {recipientFirstName} in {city}. {recipientFirstName} will not be told who sent this.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted-foreground">
        A gift for {recipientFirstName} — delivering to {city}.
      </p>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {step === 'email' ? (
        <div className="flex flex-col gap-2">
          <ContactStep defaultValues={{ email }} onSubmit={handleEmailContinue} />
          {loadingRates ? (
            <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
              Checking shipping options…
            </p>
          ) : null}
        </div>
      ) : null}

      {step === 'shipping' ? (
        <div className="flex flex-col gap-4">
          <RadioGroup
            aria-label="Shipping method"
            value={selectedShippingId}
            onValueChange={(value) => setSelectedShippingId(value as string)}
          >
            {shippingOptions.map((option) => (
              <label
                key={option.id}
                className={cn(
                  'flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-border p-4 transition-colors',
                  selectedShippingId === option.id && 'border-accent bg-accent/5',
                )}
              >
                <span className="flex items-center gap-3">
                  <RadioGroupItem value={option.id} />
                  <span className="text-sm font-medium text-foreground">{option.label}</span>
                </span>
                <span className="text-sm font-medium text-foreground">
                  {formatMoney({ amountMinor: option.amountMinor, currency: option.currency })}
                </span>
              </label>
            ))}
          </RadioGroup>

          <Button type="button" className="w-full" disabled={placing} onClick={handlePay}>
            {placing ? 'Processing…' : 'Pay for this gift'}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
