import type { Metadata } from 'next'
import { Container } from '@/components/brand/container'
import { JsonLd } from '@/components/seo/json-ld'
import { FaqAccordion } from '@/features/content/components/faq-accordion'
import { FAQ_GROUPS } from '@/features/content/data/faq'
import { faqJsonLd } from '@/lib/seo'

export const metadata: Metadata = {
  title: 'FAQ',
  description: 'Answers to common questions about orders, shipping, product care, and returns at MSE Lux.',
  alternates: { canonical: '/faq' },
}

export default function FaqPage() {
  return (
    <Container className="flex flex-col gap-8 py-12 sm:py-16">
      {/* Built from the same FAQ_GROUPS the accordion renders — the markup
          and the visible answers cannot drift apart. */}
      <JsonLd data={faqJsonLd(FAQ_GROUPS)} />

      <h1 className="font-display text-3xl font-semibold text-foreground sm:text-4xl">Frequently asked questions</h1>
      <FaqAccordion groups={FAQ_GROUPS} />
    </Container>
  )
}
