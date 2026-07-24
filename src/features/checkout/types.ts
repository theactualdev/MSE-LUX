// Types for `src/features/checkout/data.ts`. Live in this sibling non-directive
// module (mirroring `src/features/cart/types.ts`) because a `'use server'`
// module may only export async functions — a `type`/`interface` export from
// `data.ts` itself would violate that constraint.

import type { Address } from '@/features/checkout/schema'
import type { OrderView } from '@/features/checkout/lib/order-view'

/** One line of a guest checkout's cart, supplied by the client since a guest has no server-side cart to read. */
export interface GuestOrderLine {
  productId: string
  variantId?: string
  quantity: number
}

export interface PlaceOrderInput {
  contact: { email: string }
  address: Address
  shippingMethodId: string
  chargeCurrency: 'NGN' | 'USD'
  /** Used ONLY when there is no signed-in user — a signed-in caller's persisted server cart is authoritative instead. */
  guestLines?: GuestOrderLine[]
}

export type PlaceOrderResult = { ok: true; order: OrderView } | { error: string }
