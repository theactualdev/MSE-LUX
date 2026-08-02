import Link from 'next/link'
import { Container } from '@/components/brand/container'
import { SectionHeading } from '@/components/brand/section-heading'
import { Rail, RailItem } from '@/components/brand/rail'
import { CollectionCard } from '@/features/catalog/components/collection-card'
import { getAllCollections } from '@/features/catalog/server/selectors'

/** Row of curated collections (bridal, everyday, statement) linking into `/collections/[slug]`. */
export async function FeaturedCollections() {
  const collections = await getAllCollections()
  if (collections.length === 0) return null

  return (
    <Container className="flex flex-col gap-8 py-12 sm:py-16">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <SectionHeading title="Shop by Collection" subtitle="Curated edits for the moments that matter." />
        <Link
          href="/collections"
          className="text-sm font-medium text-foreground underline-offset-4 hover:underline"
        >
          View all
        </Link>
      </div>

      <Rail label="Featured collections">
        {collections.map((collection) => (
          <RailItem key={collection.slug}>
            <CollectionCard collection={collection} />
          </RailItem>
        ))}
      </Rail>
    </Container>
  )
}
