'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ShoppingBag } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ContactStep } from '@/features/checkout/components/contact-step'
import { AddressStep } from '@/features/checkout/components/address-step'
import { ShippingStep } from '@/features/checkout/components/shipping-step'
import { PaymentStep, type PaymentMethod } from '@/features/checkout/components/payment-step'
import { ReviewStep } from '@/features/checkout/components/review-step'
import { OrderSummaryPanel } from '@/features/checkout/components/order-summary-panel'
import { useLastOrderStore } from '@/features/checkout/store'
import { buildMockOrder } from '@/features/checkout/lib/place-order'
import { useCartStore } from '@/features/cart/store'
import { useHydrated } from '@/features/cart/use-hydrated'
import { getCartLines } from '@/features/cart/lib/lines'
import { computeCartSummary } from '@/features/cart/lib/summary'
import { shippingMethods } from '@/features/cart/lib/shipping'
import type { Contact, Address } from '@/features/checkout/schema'
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
 * payment (mock) → review. Holds the current step and the data collected at
 * each step, and renders a persistent, read-only `<OrderSummaryPanel>`
 * alongside the active step (using the selected shipping method, defaulting
 * to the first).
 *
 * Gated on `useHydrated` so the persisted cart is never read before the
 * client has hydrated (avoids a server/client mismatch). If the cart is
 * empty, shows an empty state linking back to `/` instead of the flow.
 *
 * On `Place order`, `orderNumber` and `placedAt` are generated here, inside
 * the event handler (never during render), before building and persisting
 * the mock order and clearing the cart.
 */
export function CheckoutFlow() {
  const router = useRouter()
  const hydrated = useHydrated()
  const items = useCartStore((s) => s.items)

  const [step, setStep] = useState<Step>('contact')
  const [contact, setContact] = useState<Contact>()
  const [address, setAddress] = useState<Address>()
  const [shippingMethod, setShippingMethod] = useState(shippingMethods[0])
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('card')

  if (!hydrated) {
    return (
      <div className="flex flex-col gap-10 lg:flex-row lg:items-start" aria-hidden="true">
        <Skeleton className="h-96 flex-1 rounded-xl" />
        <Skeleton className="h-56 w-full rounded-xl lg:w-80 lg:shrink-0" />
      </div>
    )
  }

  const lines = getCartLines(items, 'NGN')

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

  const summary = computeCartSummary(lines, shippingMethod.amount)

  function handlePlaceOrder() {
    if (!contact || !address) return

    const orderNumber = `MSE-${Math.floor(100_000 + Math.random() * 900_000)}`
    const placedAt = new Date().toISOString()

    const order = buildMockOrder({
      contact,
      address,
      shippingMethod,
      lines,
      summary,
      orderNumber,
      placedAt,
    })

    useLastOrderStore.getState().setOrder(order)
    useCartStore.getState().clear()
    router.push(`/order/${order.orderNumber}`)
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
          <AddressStep
            defaultValues={address}
            onSubmit={(values) => {
              setAddress(values)
              setStep('shipping')
            }}
          />
        ) : null}

        {step === 'shipping' ? (
          <ShippingStep
            methods={shippingMethods}
            defaultValue={shippingMethod}
            onSelect={(method) => {
              setShippingMethod(method)
              setStep('payment')
            }}
          />
        ) : null}

        {step === 'payment' ? (
          <PaymentStep
            defaultValue={paymentMethod}
            onSelect={(method) => {
              setPaymentMethod(method)
              setStep('review')
            }}
          />
        ) : null}

        {step === 'review' && contact && address ? (
          <ReviewStep
            contact={contact}
            address={address}
            shippingMethod={shippingMethod}
            lines={lines}
            summary={summary}
            onPlaceOrder={handlePlaceOrder}
          />
        ) : null}
      </div>

      <OrderSummaryPanel
        lines={lines}
        summary={summary}
        shippingMethod={shippingMethod}
        className="w-full lg:sticky lg:top-24 lg:w-80 lg:shrink-0"
      />
    </div>
  )
}
