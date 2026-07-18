import type { Metadata } from 'next'
import { Container } from '@/components/brand/container'
import { FaqAccordion } from '@/features/content/components/faq-accordion'
import { FAQ_GROUPS } from '@/features/content/data/faq'

export const metadata: Metadata = {
  title: 'FAQ',
  description: 'Answers to common questions about orders, shipping, product care, and returns at MSE Lux.',
}

export default function FaqPage() {
  return (
    <Container className="flex flex-col gap-8 py-12 sm:py-16">
      <h1 className="font-display text-3xl font-semibold text-foreground sm:text-4xl">Frequently asked questions</h1>
      <FaqAccordion groups={FAQ_GROUPS} />
    </Container>
  )
}
