import type { Money } from '@/types/money'
import type { CartLine } from '@/features/cart/lib/lines'
import type { CartSummary } from '@/features/cart/lib/summary'
import type { ShippingMethod } from '@/features/cart/lib/shipping'
import type { Contact, Address } from '@/features/checkout/schema'

export interface OrderLine {
  name: string
  variantLabel?: string
  image: { src: string; alt: string }
  quantity: number
  unitPrice: Money
  lineTotal: Money
}

export interface Order {
  orderNumber: string
  email: string
  address: Address
  shippingLabel: string
  lines: OrderLine[]
  summary: CartSummary
  placedAt: string
}

export interface BuildMockOrderInput {
  contact: Contact
  address: Address
  shippingMethod: ShippingMethod
  lines: CartLine[]
  summary: CartSummary
  orderNumber: string
  placedAt: string
}

function toOrderLine(line: CartLine): OrderLine {
  const optionValues = line.variant?.options.map((o) => o.value) ?? []
  return {
    name: line.product.name,
    variantLabel: optionValues.length > 0 ? optionValues.join(' / ') : undefined,
    image: line.image,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    lineTotal: line.lineTotal,
  }
}

/**
 * Pure mock order builder. `orderNumber` and `placedAt` are passed in (not
 * generated here) so the result stays deterministic and testable. Real order
 * placement happens server-side in a later phase.
 */
export function buildMockOrder(input: BuildMockOrderInput): Order {
  return {
    orderNumber: input.orderNumber,
    email: input.contact.email,
    address: input.address,
    shippingLabel: input.shippingMethod.label,
    lines: input.lines.map(toOrderLine),
    summary: input.summary,
    placedAt: input.placedAt,
  }
}
