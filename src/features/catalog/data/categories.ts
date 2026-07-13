import type { Category } from '@/types/catalog'

export const categories: Category[] = [
  {
    slug: 'jewelry',
    name: 'Jewelry',
    description: 'Handcrafted necklaces, bracelets, earrings, anklets, and rings.',
    image: 'https://picsum.photos/seed/cat-jewelry/900/600',
    subcategories: [
      { slug: 'necklaces', name: 'Necklaces', categorySlug: 'jewelry' },
      { slug: 'bracelets', name: 'Bracelets', categorySlug: 'jewelry' },
      { slug: 'earrings', name: 'Earrings', categorySlug: 'jewelry' },
      { slug: 'anklets', name: 'Anklets', categorySlug: 'jewelry' },
      { slug: 'rings', name: 'Rings', categorySlug: 'jewelry' },
    ],
  },
  {
    slug: 'beads',
    name: 'Beads',
    description: 'Loose beads, bead strands, and waist beads for every occasion.',
    image: 'https://picsum.photos/seed/cat-beads/900/600',
    subcategories: [
      { slug: 'loose-beads', name: 'Loose Beads', categorySlug: 'beads' },
      { slug: 'bead-strands', name: 'Bead Strands', categorySlug: 'beads' },
      { slug: 'waist-beads', name: 'Waist Beads', categorySlug: 'beads' },
    ],
  },
  {
    slug: 'accessories',
    name: 'Accessories',
    description: 'Bags, hair accessories, and finishing touches.',
    image: 'https://picsum.photos/seed/cat-accessories/900/600',
    subcategories: [
      { slug: 'bags', name: 'Bags', categorySlug: 'accessories' },
      { slug: 'hair', name: 'Hair', categorySlug: 'accessories' },
      { slug: 'other', name: 'Other', categorySlug: 'accessories' },
    ],
  },
]
