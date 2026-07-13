import { describe, it, expect } from 'vitest'
import { siteConfig } from '@/lib/config'
import { categories } from '@/features/catalog/data'

describe('siteConfig.nav taxonomy', () => {
  it('has Jewelry with subcategory children including Necklaces', () => {
    const jewelry = siteConfig.nav.find((n) => n.href === '/jewelry')
    expect(jewelry?.children?.some((c) => c.href === '/jewelry/necklaces')).toBe(true)
  })
  it('includes Beads, Accessories, and Collections top-level entries', () => {
    const hrefs = siteConfig.nav.map((n) => n.href)
    expect(hrefs).toEqual(expect.arrayContaining(['/beads', '/accessories', '/collections']))
  })

  it('reflects every category and subcategory from the catalog taxonomy', () => {
    for (const category of categories) {
      const navItem = siteConfig.nav.find((n) => n.href === `/${category.slug}`)
      expect(navItem, `expected nav item for /${category.slug}`).toBeDefined()
      expect(navItem?.label).toBe(category.name)

      const childHrefs = navItem?.children?.map((c) => c.href) ?? []
      const expectedHrefs = category.subcategories.map(
        (sub) => `/${category.slug}/${sub.slug}`,
      )
      expect(childHrefs).toEqual(expect.arrayContaining(expectedHrefs))
      expect(childHrefs).toHaveLength(expectedHrefs.length)
    }
  })

  it('keeps About alongside the taxonomy-driven entries', () => {
    const hrefs = siteConfig.nav.map((n) => n.href)
    expect(hrefs).toContain('/about')
  })
})
