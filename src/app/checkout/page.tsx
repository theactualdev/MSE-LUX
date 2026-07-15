import type { Metadata } from 'next'
import { Container } from '@/components/brand/container'
import { SectionHeading } from '@/components/brand/section-heading'
import { CheckoutFlow } from '@/features/checkout/components/checkout-flow'

export const metadata: Metadata = {
  title: 'Checkout',
  description: 'Complete your order: contact, shipping, payment, and review.',
}

export default function CheckoutPage() {
  return (
    <Container className="flex flex-col gap-8 py-12 sm:py-16">
      <SectionHeading title="Checkout" as="h1" />
      <CheckoutFlow />
    </Container>
  )
}
