import { resolveDisplayPrice } from '@/lib/money'
import type { Currency, FxRates, Money } from '@/types/money'
import type { Product, ProductVariant } from '@/types/catalog'

/** Resolves the display price (and optional sale price) for a product/variant in the given currency, using the supplied FX rates. */
export function resolveProductPrice(
  product: Product,
  variant: ProductVariant | undefined,
  currency: Currency,
  rates: FxRates,
): { price: Money; sale: Money | null } {
  const priceSet = variant?.priceSet ?? product.priceSet
  const price = resolveDisplayPrice(priceSet, currency, rates)
  const sale = product.salePriceSet ? resolveDisplayPrice(product.salePriceSet, currency, rates) : null
  return { price, sale }
}
