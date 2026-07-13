import { categories } from '@/features/catalog/data'
import type { NavItem } from '@/types/nav'

/** Category/subcategory taxonomy, mapped into the nav shape Header/MegaMenu/MobileDrawer consume. */
const taxonomyNav: NavItem[] = categories.map((category) => ({
  label: category.name,
  href: `/${category.slug}`,
  children: category.subcategories.map((sub) => ({
    label: sub.name,
    href: `/${category.slug}/${sub.slug}`,
  })),
}))

export const siteConfig = {
  name: 'MSE Lux',
  description:
    'MSE Lux — handmade beads, jewelry and accessories, crafted in Lagos.',
  authoredCurrencies: ['NGN', 'USD'] as const,
  social: {
    instagram: 'https://www.instagram.com/mse_beadsandaccessories',
  },
  nav: [
    ...taxonomyNav,
    { label: 'Collections', href: '/collections' },
    { label: 'About', href: '/about' },
  ] satisfies NavItem[],
} as const
