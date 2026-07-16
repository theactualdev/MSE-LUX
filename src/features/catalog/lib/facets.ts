import type { Product } from '@/types/catalog'

export const PRODUCT_BADGES = ['new', 'best-seller'] as const
export type ProductBadge = (typeof PRODUCT_BADGES)[number]

/** A product is in stock if it (variantless) has inventory, or any variant does. */
export function isInStock(product: Product): boolean {
  if (product.variants.length > 0) return product.variants.some((v) => v.inventory > 0)
  return product.inventory > 0
}

/** Color option values for a product (the `Color` optionType), or [] if none. */
export function getColorOptions(product: Product): string[] {
  const colorType = product.optionTypes.find((o) => o.name.toLowerCase() === 'color')
  return colorType ? colorType.values : []
}

function sortedUnique(values: string[]): string[] {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b))
}

export function allMaterialTags(products: Product[]): string[] {
  return sortedUnique(products.flatMap((p) => p.materialTags))
}

export function allColors(products: Product[]): string[] {
  return sortedUnique(products.flatMap(getColorOptions))
}
