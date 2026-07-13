import { resolveDisplayPrice } from '@/lib/money'
import type { Currency, Money } from '@/types/money'
import type { Product, ProductVariant } from '@/types/catalog'

/** Resolves the display price (and optional sale price) for a product/variant in the given currency. */
export function resolveProductPrice(
  product: Product,
  variant: ProductVariant | undefined,
  currency: Currency,
): { price: Money; sale: Money | null } {
  const priceSet = variant?.priceSet ?? product.priceSet
  const price = resolveDisplayPrice(priceSet, currency, {})
  const sale = product.salePriceSet ? resolveDisplayPrice(product.salePriceSet, currency, {}) : null
  return { price, sale }
}
