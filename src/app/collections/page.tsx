import type { Metadata } from 'next'
import { Container } from '@/components/brand/container'
import { SectionHeading } from '@/components/brand/section-heading'
import { CollectionCard } from '@/features/catalog/components/collection-card'
import { getAllCollections } from '@/features/catalog/server/selectors'

export const metadata: Metadata = {
  title: 'Collections',
  description: 'Explore MSE Lux collections — bridal, everyday, and statement pieces curated by occasion.',
}

// ISR: catalog is effectively static until the Phase 8 admin exists; hourly
// revalidation propagates seed edits without a rebuild. (Route-segment revalidate
// per node_modules/next/dist/docs/01-app/02-guides/caching-without-cache-components.md)
export const revalidate = 3600

export default async function CollectionsPage() {
  const collections = await getAllCollections()

  return (
    <Container className="flex flex-col gap-8 py-12 sm:py-16">
      <SectionHeading
        title="Collections"
        subtitle="Curated edits for the moments that matter, from everyday staples to bridal heirlooms."
        as="h1"
      />

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {collections.map((collection) => (
          <CollectionCard key={collection.slug} collection={collection} />
        ))}
      </div>
    </Container>
  )
}
