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
  shippingToken: string
  chargeCurrency: 'NGN' | 'USD'
  /** Used ONLY when there is no signed-in user — a signed-in caller's persisted server cart is authoritative instead. */
  guestLines?: GuestOrderLine[]
  /**
   * "Save this address to my account" — best-effort, checked only by a
   * signed-in caller's checkout UI (see `AddressStep`). Never affects order
   * placement itself: `placeOrder` only attempts the save-back after the
   * order transaction has already committed, and swallows any failure. See
   * `placeOrder`'s doc comment for the full contract.
   */
  saveAddress?: boolean
  /**
   * A discount CODE, never an amount or a percentage. `placeOrder` re-resolves
   * it and re-derives the discount server-side, exactly as it re-prices every
   * line against the authored catalog — so a client-supplied discount value is
   * not distrusted, it is unsendable. Same shape as `shippingToken`.
   */
  discountCode?: string
}

export type PlaceOrderResult = { ok: true; order: OrderView } | { error: string }
