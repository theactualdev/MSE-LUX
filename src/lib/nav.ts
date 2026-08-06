import type { Category } from '@/types/catalog'
import type { NavItem } from '@/types/nav'

/**
 * Navigation items that are NOT catalog taxonomy. Authored here because they
 * are routes, not data — no amount of admin editing should be able to remove
 * `/collections` or `/about` from the header.
 */
export const STATIC_NAV_ITEMS: NavItem[] = [
  { label: 'Collections', href: '/collections' },
  { label: 'About', href: '/about' },
]

/**
 * Builds the header/footer/drawer navigation from catalog taxonomy.
 *
 * PURE — takes categories, returns nav items, touches no I/O. That is
 * deliberate: the caller (`AppShell`) reads the database, and keeping the
 * shape logic separate means it can be unit tested without Prisma.
 *
 * This replaced a version that mapped the CODE FIXTURE
 * (`features/catalog/data/categories.ts`) instead of the database. The result
 * was a split brain: category pages, the home page rail and the sitemap all
 * read the DB, while the header, mega menu, mobile drawer and footer read the
 * fixture. A category added through the admin got a working `/[slug]` page and
 * a sitemap entry but never appeared in navigation — published everywhere
 * except the place customers actually look.
 */
export function buildNav(categories: Category[]): NavItem[] {
  const taxonomy: NavItem[] = categories.map((category) => ({
    label: category.name,
    href: `/${category.slug}`,
    // Omit `children` entirely for a category with no subcategories rather
    // than passing an empty array — the mega menu treats the key's presence as
    // "this item has a submenu", so `[]` would render an empty flyout.
    ...(category.subcategories.length > 0
      ? {
          children: category.subcategories.map((sub) => ({
            label: sub.name,
            href: `/${category.slug}/${sub.slug}`,
          })),
        }
      : {}),
  }))

  return [...taxonomy, ...STATIC_NAV_ITEMS]
}
