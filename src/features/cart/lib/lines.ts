import type { Currency, Money } from '@/types/money'
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
    const { price: unitPrice } = resolveProductPrice(product, variant, currency)
    const lineTotal: Money = {
      amountMinor: unitPrice.amountMinor * item.quantity,
      currency: unitPrice.currency,
    }

    lines.push({ product, variant, image, quantity: item.quantity, unitPrice, lineTotal })
  }

  return lines
}
