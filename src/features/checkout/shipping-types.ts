/**
 * Shared checkout-shipping types. No directive (unlike `lib/shipping-quote.ts`
 * or `shipping.ts`) so both client components (rendering `ShippingOption`s)
 * and server code (signing/verifying `ShippingQuotePayload`s) can import
 * from here without pulling `server-only` into a client bundle.
 */

/** The signed payload embedded in a `ShippingOption.token` (see `lib/shipping-quote.ts`). */
export interface ShippingQuotePayload {
  label: string
  amountMinor: number
  currency: 'NGN' | 'USD'
  addressHash: string
  /**
   * A random per-quote salt (`newQuoteSalt()`, `lib/shipping-quote.ts`) mixed
   * into `addressHash` so a hash is only meaningful alongside the salt that
   * produced it — see that file's docblock for why this closes the
   * online-oracle hole a keyed-but-unsalted digest still left open.
   */
  salt: string
  exp: number // epoch ms
}

/** A selectable shipping rate offered to the customer at checkout. */
export interface ShippingOption {
  id: string
  label: string
  amountMinor: number
  currency: 'NGN' | 'USD'
  deliveryEta?: string
  token: string
}
