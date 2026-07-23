import type { Currency, FxRates, Money } from '@/types/money'
import type { Product, ProductVariant } from '@/types/catalog'
import type { CartItem } from '@/features/cart/store'
import { getProductById } from '@/features/catalog/lib/selectors'
import { resolveProductPrice } from '@/features/catalog/lib/pricing'

export interface CartLine {
  product: Product
  variant?: ProductVariant
  image: { src: string; alt: string }
  quantity: number
  unitPrice: Money
  lineTotal: Money
}

export function getCartLines(items: CartItem[], currency: Currency): CartLine[] {
  const lines: CartLine[] = []

  for (const item of items) {
    const product = getProductById(item.productId)
    if (!product) continue

    const variant = product.variants.find((v) => v.id === item.variantId)
    const image = variant?.image ? { src: variant.image, alt: product.name } : product.images[0]
    // Cart lines are NGN-only today (Task 8 threads viewer currency + FX rates through
    // checkout); rates are unused for the authored NGN/USD path resolveDisplayPrice takes here.
    const { price: unitPrice } = resolveProductPrice(product, variant, currency, {})
    const lineTotal: Money = {
      amountMinor: unitPrice.amountMinor * item.quantity,
      currency: unitPrice.currency,
    }

    lines.push({ product, variant, image, quantity: item.quantity, unitPrice, lineTotal })
  }

  return lines
}

/**
 * Same per-line logic as `getCartLines`, but takes an already-resolved
 * `products` array instead of going through the sync mock `getProductById`.
 * Used by `useCart()`, which resolves ids through the `resolveProductsByIds`
 * server action (both guest and signed-in carts store bare
 * `{productId,variantId,quantity}` lines, never full products) — see that
 * hook for why. Preserves the same defensive "drop unresolvable" behavior.
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
