import type { Metadata } from 'next'
import { Container } from '@/components/brand/container'
import { SectionHeading } from '@/components/brand/section-heading'
import { CartView } from '@/features/cart/components/cart-view'

export const metadata: Metadata = {
  title: 'Your bag',
  description: 'Review your bag, adjust quantities, and proceed to checkout.',
}

export default function CartPage() {
  return (
    <Container className="flex flex-col gap-8 py-12 sm:py-16">
      <SectionHeading title="Your bag" as="h1" />
      <CartView />
    </Container>
  )
}
