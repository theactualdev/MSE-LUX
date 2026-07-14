import Link from 'next/link'
import Image from 'next/image'
import { cn } from '@/lib/utils'
import { getProductsInCollection } from '@/features/catalog/lib/selectors'
import type { Collection } from '@/types/catalog'

interface CollectionCardProps {
  collection: Collection
  className?: string
}

/**
 * Photography-forward entry point into a collection: edge-to-edge image,
 * name, and product count, linking to the collection detail page. Falls
 * back to a representative product image when the collection has none.
 */
export function CollectionCard({ collection, className }: CollectionCardProps) {
  const count = collection.productSlugs.length
  const fallbackImage = getProductsInCollection(collection.slug)[0]?.images[0]
  const image = collection.image
    ? { src: collection.image, alt: collection.name }
    : fallbackImage

  return (
    <Link
      href={`/collections/${collection.slug}`}
      className={cn(
        'group flex flex-col overflow-hidden rounded-xl bg-card ring-1 ring-border transition-shadow duration-300 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        className,
      )}
    >
      <div className="relative aspect-[3/2] w-full overflow-hidden bg-muted">
        {image ? (
          <Image
            src={image.src}
            alt={image.alt}
            fill
            sizes="(min-width: 1024px) 30vw, (min-width: 640px) 45vw, 90vw"
            className="object-cover transition-transform duration-500 ease-out group-hover:scale-105"
          />
        ) : null}
      </div>

      <div className="flex flex-col gap-1 p-4">
        <h3 className="font-display text-lg font-medium text-foreground">{collection.name}</h3>
        <p className="text-sm text-muted-foreground">
          {count} {count === 1 ? 'piece' : 'pieces'}
        </p>
      </div>
    </Link>
  )
}
