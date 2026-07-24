import type { Money } from '@/types/money'
import type { CartSummary } from '@/features/cart/lib/summary'
import type { Address } from '@/features/checkout/schema'

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
