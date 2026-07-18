import type { Metadata } from 'next'
import { Container } from '@/components/brand/container'
import { PolicyPageView } from '@/features/content/components/policy-page'
import { POLICY_PAGES } from '@/features/content/data/policies'

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'What information MSE Lux collects when you shop with us, and how we use it.',
}

export default function PrivacyPage() {
  return (
    <Container>
      <PolicyPageView page={POLICY_PAGES.privacy} />
    </Container>
  )
}
