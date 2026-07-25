import type { Metadata } from 'next'
import { Container } from '@/components/brand/container'
import { PolicyPageView } from '@/features/content/components/policy-page'
import { POLICY_PAGES } from '@/features/content/data/policies'

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'The terms that apply when you browse or place an order with MSE Lux.',
}

export default function TermsPage() {
  return (
    <Container>
      <PolicyPageView page={POLICY_PAGES.terms} />
    </Container>
  )
}
