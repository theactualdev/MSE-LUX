/**
 * Site-wide identity and links.
 *
 * `nav` deliberately does NOT live here any more. It used to be derived from
 * the `categories` CODE FIXTURE, which meant the header, mega menu, mobile
 * drawer and footer showed hardcoded taxonomy while category pages, the home
 * page rail and the sitemap all read the database — so a category created in
 * the admin was published everywhere except the navigation. Nav is now built
 * from the database by `buildNav` (`@/lib/nav`) and passed down from
 * `AppShell`.
 */
export const siteConfig = {
  name: 'MSE Lux',
  description:
    'MSE Lux — handmade beads, jewelry and accessories, crafted in Lagos.',
  authoredCurrencies: ['NGN', 'USD'] as const,
  social: {
    instagram: 'https://www.instagram.com/mse_beadsandaccessories',
  },
} as const
