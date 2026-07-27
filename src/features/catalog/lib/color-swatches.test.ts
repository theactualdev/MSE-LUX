import { describe, expect, it } from 'vitest'
import { products } from '@/features/catalog/data/products'
import { allColors } from '@/features/catalog/lib/facets'
import { COLOR_SWATCHES } from '@/features/catalog/lib/color-swatches'

describe('COLOR_SWATCHES', () => {
  it('covers every color in the catalog (no silent gray swatch)', () => {
    for (const color of allColors(products)) {
      expect(COLOR_SWATCHES[color], `no swatch for "${color}"`).toBeDefined()
    }
  })
})
