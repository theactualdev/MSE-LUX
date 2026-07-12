import type { NavItem } from '@/types/nav'

export const siteConfig = {
  name: 'MSE Lux',
  description:
    'MSE Lux — handmade beads, jewelry and accessories, crafted in Lagos.',
  authoredCurrencies: ['NGN', 'USD'] as const,
  social: {
    instagram: 'https://www.instagram.com/mse_beadsandaccessories',
  },
  nav: [
    { label: 'Jewelry', href: '/jewelry', children: [
      { label: 'Necklaces', href: '/jewelry/necklaces' },
      { label: 'Bracelets', href: '/jewelry/bracelets' },
      { label: 'Earrings', href: '/jewelry/earrings' },
    ] },
    { label: 'Beads', href: '/beads' },
    { label: 'Accessories', href: '/accessories' },
    { label: 'Collections', href: '/collections' },
    { label: 'About', href: '/about' },
  ] satisfies NavItem[],
} as const
