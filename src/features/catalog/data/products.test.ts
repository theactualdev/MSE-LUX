import { describe, expect, it } from 'vitest'
import { products } from '@/features/catalog/data/products'

describe('product materialTags', () => {
  it('every product has at least one material tag', () => {
    for (const p of products) {
      expect(p.materialTags.length, `product ${p.slug} has no materialTags`).toBeGreaterThan(0)
    }
  })

  it('tags are non-empty, trimmed, Title-Case-ish strings (no leading/trailing space)', () => {
    for (const p of products) {
      for (const tag of p.materialTags) {
        expect(tag).toBe(tag.trim())
        expect(tag.length).toBeGreaterThan(0)
      }
    }
  })
})
