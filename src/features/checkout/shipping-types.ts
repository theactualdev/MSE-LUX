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
  /**
   * Which flow minted this quote — `'checkout'` (the ordinary address-entry
   * step) or `'gift'` (`getGiftShippingRates`, quoted against a wishlist
   * owner's hidden address). A gift buyer legitimately holds a token bound to
   * an address they were never shown; without this field, `placeOrder` (which
   * takes a caller-supplied `address` AND `shippingToken`) would happily run
   * `verifyQuote` against any address the caller guesses, and the difference
   * between "wrong guess" (verification fails) and "right guess" (falls
   * through to the empty-cart check) is a free, unlimited equality oracle
   * for the recipient's `line1`/`postalCode` — the exact address the gift
   * flow exists to hide. Scoping each token to the flow that minted it closes
   * that: `placeOrder` only accepts `'checkout'`, `placeGiftOrder` only
   * accepts `'gift'`, so a gift token has no endpoint left that will compare
   * it against a caller-supplied address. See `data.ts`/`checkout-actions.ts`
   * for the enforcement and `shipping.ts` for where it's threaded in.
   */
  scope: 'checkout' | 'gift'
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
