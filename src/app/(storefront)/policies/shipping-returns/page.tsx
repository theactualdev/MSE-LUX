import type { Metadata } from 'next'
import { Container } from '@/components/brand/container'
import { PolicyPageView } from '@/features/content/components/policy-page'
import { POLICY_PAGES } from '@/features/content/data/policies'

export const metadata: Metadata = {
  title: 'Shipping & Returns',
  description: 'How shipping rates, delivery estimates, processing times, returns and exchanges work at MSE Lux.',
  alternates: { canonical: '/policies/shipping-returns' },
}

export default function ShippingReturnsPage() {
  return (
    <Container>
      <PolicyPageView page={POLICY_PAGES['shipping-returns']} />
    </Container>
  )
}
