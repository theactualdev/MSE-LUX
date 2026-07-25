'use client'

import { ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface PaymentStepProps {
  onContinue: () => void
}

/**
 * Explains that payment is completed securely via Paystack, on the review
 * step's "Place order" action — no card details are collected here. The
 * actual charge happens after the order is placed: `handlePlaceOrder` in
 * `checkout-flow.tsx` places the PENDING order, initializes a Paystack
 * transaction, and opens the inline popup.
 */
export function PaymentStep({ onContinue }: PaymentStepProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-3 rounded-xl border border-border bg-muted px-4 py-3 text-sm text-muted-foreground">
        <ShieldCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-accent" />
        <p>
          Payment is completed securely via Paystack on the next step. You&apos;ll enter your card
          or bank details in Paystack&apos;s own checkout popup — we never see or store them.
        </p>
      </div>

      <Button type="button" className="mt-2 w-full" onClick={onContinue}>
        Continue to review
      </Button>
    </div>
  )
}
