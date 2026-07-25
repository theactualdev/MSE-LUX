import type { Metadata } from 'next'
import { Container } from '@/components/brand/container'
import { ContentPageView } from '@/features/content/components/content-page'
import { ABOUT_PAGE } from '@/features/content/data/about'

export const metadata: Metadata = {
  title: 'About',
  description: 'The story behind MSE Lux — a Lagos-based studio making handmade beads, jewelry, and accessories.',
}

export default function AboutPage() {
  return (
    <Container>
      <ContentPageView page={ABOUT_PAGE} />
    </Container>
  )
}
