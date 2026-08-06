import { describe, it, expect } from 'vitest'
import { buildNav, STATIC_NAV_ITEMS } from '@/lib/nav'
import type { Category } from '@/types/catalog'

/**
 * These assertions moved here from `config.test.ts` when navigation stopped
 * being derived from the `categories` code fixture. They now exercise
 * `buildNav` against explicit inputs rather than reading a module-level
 * constant — the point of the change was that nav follows the DATABASE, so a
 * test that pins it to the fixture would re-assert the bug.
 */
const category = (over: Partial<Category> = {}): Category => ({
  slug: 'jewelry',
  name: 'Jewelry',
  description: undefined,
  image: undefined,
  subcategories: [{ slug: 'necklaces', name: 'Necklaces', categorySlug: 'jewelry' }],
  ...over,
})

describe('buildNav', () => {
  it('maps a category to a nav item with subcategory children', () => {
    const nav = buildNav([category()])
    const jewelry = nav.find((n) => n.href === '/jewelry')

    expect(jewelry?.label).toBe('Jewelry')
    expect(jewelry?.children).toEqual([{ label: 'Necklaces', href: '/jewelry/necklaces' }])
  })

  it('appends the static entries after the taxonomy', () => {
    const nav = buildNav([category()])
    const hrefs = nav.map((n) => n.href)

    expect(hrefs).toEqual(['/jewelry', ...STATIC_NAV_ITEMS.map((i) => i.href)])
    expect(hrefs).toEqual(expect.arrayContaining(['/collections', '/about']))
  })

  // The mega menu keys off the PRESENCE of `children` to decide whether to
  // render a flyout, so an empty array would open an empty panel.
  it('omits the children key entirely for a category with no subcategories', () => {
    const nav = buildNav([category({ slug: 'beads', name: 'Beads', subcategories: [] })])
    const beads = nav.find((n) => n.href === '/beads')

    expect(beads).toBeDefined()
    expect(beads).not.toHaveProperty('children')
  })

  // The whole point of the change: a category that exists only in the database
  // must reach the header. Nothing here may consult the code fixture.
  it('includes a category that appears in no code fixture', () => {
    const nav = buildNav([category({ slug: 'bridal-sets', name: 'Bridal Sets', subcategories: [] })])

    expect(nav.map((n) => n.href)).toContain('/bridal-sets')
  })

  it('returns just the static entries when there is no taxonomy', () => {
    expect(buildNav([])).toEqual(STATIC_NAV_ITEMS)
  })
})
