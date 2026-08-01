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
   * for the enforcement and `lib/shipping-rates.ts` for where it's threaded in.
   *
   * SCOPE IS NOT SETTABLE BY A CALLER, and that is load-bearing rather than
   * incidental. It was briefly a field of `getShippingRates`' input — but that
   * is a `'use server'` export, i.e. a public HTTP endpoint whose arguments
   * come off the wire, so an attacker could ask for a gift-scoped token bound
   * to an address of their own choosing and probe `placeGiftOrder` with it,
   * recreating the very oracle this field exists to close. The rate builder
   * now lives in a non-action module (`lib/shipping-rates.ts`) that takes the
   * scope as a separate argument no request can reach.
   */
  scope: 'checkout' | 'gift'
  /**
   * GIFT SCOPE ONLY: an HMAC reference (`shareRefFor`, `lib/shipping-quote.ts`)
   * to the share token this quote was produced for. Absent on checkout quotes.
   *
   * `scope: 'gift'` alone is not enough to stop the address oracle, because
   * minting a gift-scoped token for an address you control is a legitimate
   * operation: `enableShare` lets any account pin ANY address it owns, so an
   * attacker can save a GUESSED street as their own address, share their own
   * wishlist, take a genuinely gift-scoped quote for it, and then spend that
   * token against the VICTIM's share — where a wrong guess fails
   * `verifyQuote` and a right guess passes, which is the oracle again.
   * Binding the token to the share it was quoted for closes that: a quote
   * minted against the attacker's own share can never be presented at
   * someone else's, whatever address it happens to be bound to.
   *
   * A REFERENCE, NOT THE TOKEN ITSELF: the payload is plain base64url and the
   * buyer's browser can read it, so putting the raw share token in there would
   * leak a capability (anyone who saw the quote could resolve the share). The
   * HMAC is computed under `SHIPBUBBLE_QUOTE_SECRET`, so it is unforgeable
   * without the secret and reveals nothing about the token it commits to.
   */
  shareRef?: string
}

/**
 * What `verifyQuote` actually hands back. Identical to `ShippingQuotePayload`
 * except that `scope` is OPTIONAL — and that difference is deliberate rather
 * than sloppy: `verifyQuote` casts decoded JSON, so at the TYPE level a token
 * minted before the field existed would yield `undefined` at runtime. In
 * practice that case is unreachable by the time a payload gets here: any
 * token old enough to predate `scope` also predates `salt`, so its
 * `addressHash` check fails first and `verifyQuote` returns `null` before
 * this type is ever populated with a missing `scope`. `placeOrder`'s
 * `(quote.scope ?? 'checkout')` fallback (`data.ts`) is therefore
 * defence-in-depth, not a live deploy-window path — but `scope` stays
 * optional here anyway so that `??` keeps reading as intentional code rather
 * than a dead branch a later simplification pass might delete. `signQuote`'s
 * INPUT stays `ShippingQuotePayload` (scope required), so every mint site
 * must still supply one.
 */
export type VerifiedQuotePayload = Omit<ShippingQuotePayload, 'scope'> & { scope?: 'checkout' | 'gift' }

/** A selectable shipping rate offered to the customer at checkout. */
export interface ShippingOption {
  id: string
  label: string
  amountMinor: number
  currency: 'NGN' | 'USD'
  deliveryEta?: string
  token: string
}
