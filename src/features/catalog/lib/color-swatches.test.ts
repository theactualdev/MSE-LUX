import { describe, expect, it } from 'vitest'
import { getAllProducts } from '@/features/catalog/lib/selectors'
import { allColors } from '@/features/catalog/lib/facets'
import { COLOR_SWATCHES } from '@/features/catalog/lib/color-swatches'

describe('COLOR_SWATCHES', () => {
  it('covers every color in the catalog (no silent gray swatch)', () => {
    for (const color of allColors(getAllProducts())) {
      expect(COLOR_SWATCHES[color], `no swatch for "${color}"`).toBeDefined()
    }
  })
})
