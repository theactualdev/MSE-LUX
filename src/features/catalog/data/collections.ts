import type { Collection } from '@/types/catalog'
import { products } from './products'

/**
 * `productSlugs` is derived from each product's `collectionSlugs` so the two
 * sides of the relation (Product.collectionSlugs <-> Collection.productSlugs)
 * can never drift out of sync.
 */
function productSlugsFor(collectionSlug: string): string[] {
  return products.filter((p) => p.collectionSlugs.includes(collectionSlug)).map((p) => p.slug)
}

export const collections: Collection[] = [
  {
    slug: 'bridal',
    name: 'Bridal',
    description: 'Pearls, gold accents, and heirloom-worthy pieces for wedding days.',
    image: 'https://picsum.photos/seed/collection-bridal/900/600',
    productSlugs: productSlugsFor('bridal'),
  },
  {
    slug: 'everyday',
    name: 'Everyday',
    description: 'Easy-to-wear staples for daily rotation.',
    image: 'https://picsum.photos/seed/collection-everyday/900/600',
    productSlugs: productSlugsFor('everyday'),
  },
  {
    slug: 'statement',
    name: 'Statement',
    description: 'Bold, conversation-starting pieces for nights out and special occasions.',
    image: 'https://picsum.photos/seed/collection-statement/900/600',
    productSlugs: productSlugsFor('statement'),
  },
]
