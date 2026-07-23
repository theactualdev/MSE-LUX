import type { Currency, FxRates, Money } from '@/types/money'
import type { Product, ProductVariant } from '@/types/catalog'
import type { CartItem } from '@/features/cart/store'
import { resolveProductPrice } from '@/features/catalog/lib/pricing'

export interface CartLine {
  product: Product
  variant?: ProductVariant
  image: { src: string; alt: string }
  quantity: number
  unitPrice: Money
  lineTotal: Money
}

/**
 * Takes an already-resolved `products` array (rather than going through a
 * sync catalog lookup). Used by `useCart()`, which resolves ids through the
 * `resolveProductsByIds` server action (both guest and signed-in carts store
 * bare `{productId,variantId,quantity}` lines, never full products) — see
 * that hook for why. Drops any item whose product doesn't resolve.
 */
export function buildCartLines(
  items: CartItem[],
  products: Product[],
  currency: Currency,
  rates: FxRates = {},
): CartLine[] {
  const byId = new Map(products.map((p) => [p.id, p]))
  const lines: CartLine[] = []

  for (const item of items) {
    const product = byId.get(item.productId)
    if (!product) continue

    const variant = product.variants.find((v) => v.id === item.variantId)
    const image = variant?.image ? { src: variant.image, alt: product.name } : product.images[0]
    const { price: unitPrice } = resolveProductPrice(product, variant, currency, rates)
    const lineTotal: Money = {
      amountMinor: unitPrice.amountMinor * item.quantity,
      currency: unitPrice.currency,
    }

    lines.push({ product, variant, image, quantity: item.quantity, unitPrice, lineTotal })
  }

  return lines
}
