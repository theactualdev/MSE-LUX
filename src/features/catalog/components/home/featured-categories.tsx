import Link from 'next/link'
import Image from 'next/image'
import { Container } from '@/components/brand/container'
import { SectionHeading } from '@/components/brand/section-heading'
import { getAllCategories } from '@/features/catalog/lib/selectors'

/**
 * The three top-level categories (jewelry, beads, accessories), each a
 * photography-forward tile linking into its `/[category]` listing.
 */
export function FeaturedCategories() {
  const categories = getAllCategories()

  return (
    <Container className="flex flex-col gap-8 py-12 sm:py-16">
      <SectionHeading
        title="Shop by Category"
        subtitle="Jewelry, beads, and accessories — each handcrafted in Lagos."
      />

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        {categories.map((category) => (
          <Link
            key={category.slug}
            href={`/${category.slug}`}
            className="group flex flex-col overflow-hidden rounded-xl bg-card ring-1 ring-border transition-shadow duration-300 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <div className="relative aspect-[4/5] w-full overflow-hidden bg-muted">
              {category.image ? (
                <Image
                  src={category.image}
                  alt={category.name}
                  fill
                  sizes="(min-width: 1024px) 30vw, (min-width: 640px) 45vw, 90vw"
                  className="object-cover transition-transform duration-500 ease-out group-hover:scale-105"
                />
              ) : null}
            </div>

            <div className="flex flex-col gap-1 p-4">
              <h3 className="font-display text-lg font-medium text-foreground">{category.name}</h3>
              {category.description ? (
                <p className="line-clamp-1 text-sm text-muted-foreground">{category.description}</p>
              ) : null}
            </div>
          </Link>
        ))}
      </div>
    </Container>
  )
}
