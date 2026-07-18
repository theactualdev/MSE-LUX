import { describe, expect, it } from 'vitest'
import { ABOUT_PAGE } from '@/features/content/data/about'
import { FAQ_GROUPS } from '@/features/content/data/faq'
import { POLICY_PAGES, getPolicyPage } from '@/features/content/data/policies'
import type { ContentPage } from '@/features/content/types'

function expectWellFormed(page: ContentPage, label: string) {
  expect(page.title.trim().length, `${label} title`).toBeGreaterThan(0)
  expect(page.sections.length, `${label} sections`).toBeGreaterThan(0)
  for (const section of page.sections) {
    expect(section.heading.trim().length, `${label} section heading`).toBeGreaterThan(0)
    expect(section.body.length, `${label} section body`).toBeGreaterThan(0)
    for (const para of section.body) expect(para.trim().length).toBeGreaterThan(0)
  }
}

describe('content data', () => {
  it('about page is well-formed', () => expectWellFormed(ABOUT_PAGE, 'about'))

  it('every policy page is well-formed with a valid lastUpdated', () => {
    for (const [slug, page] of Object.entries(POLICY_PAGES)) {
      expectWellFormed(page, slug)
      expect(page.lastUpdated, `${slug} lastUpdated`).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })

  it('getPolicyPage resolves known slugs and rejects unknown ones', () => {
    expect(getPolicyPage('privacy')?.title).toBe(POLICY_PAGES.privacy.title)
    expect(getPolicyPage('nope')).toBeUndefined()
  })

  it('every FAQ item has a question and an answer', () => {
    expect(FAQ_GROUPS.length).toBeGreaterThan(0)
    for (const group of FAQ_GROUPS) {
      expect(group.heading.trim().length).toBeGreaterThan(0)
      expect(group.items.length).toBeGreaterThan(0)
      for (const item of group.items) {
        expect(item.q.trim().length).toBeGreaterThan(0)
        expect(item.a.trim().length).toBeGreaterThan(0)
      }
    }
  })
})
