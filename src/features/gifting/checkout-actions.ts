'use server'

import { z } from 'zod'
import { checkRateLimit, RATE_LIMITED_MESSAGE } from '@/lib/rate-limit'
import { resolveShare } from '@/features/gifting/share'
import { createGiftOrder } from '@/features/gifting/gift-order'
import type { CreateGiftOrderResult } from '@/features/gifting/gift-order'
import { getShippingRates } from '@/features/checkout/shipping'
import { verifyQuote } from '@/features/checkout/lib/shipping-quote'
import type { Address } from '@/features/checkout/schema'
import type { ShippingOption } from '@/features/checkout/shipping-types'
import type { ResolvedShare } from '@/features/gifting/share'

/**
 * The gift purchase path — the two public Server Actions a buyer's browser
 * calls. Like every `'use server'` module in this codebase these are public
 * HTTP endpoints reachable by anyone who can reach the app, so nothing in
 * either input is trusted.
 *
 * THE SECURITY PROPERTY: NEITHER FUNCTION ACCEPTS A DESTINATION. Both resolve
 * it server-side from the share token — there is no address parameter to
 * tamper with because there is no address parameter. A caller may of course
 * POST an extra `address` key; `safeParse` (below) returns only the schema's
 * own fields, and every ship-to value passed onward is read from the resolved
 * share, so a smuggled key is not "rejected" so much as structurally
 * unreachable. The reverse direction holds too: neither action ever RETURNS
 * an address — `getGiftShippingRates` resolves to prices, `placeGiftOrder` to
 * an order number — so the recipient's street address never crosses the wire
 * in either direction.
 *
 * The existing address-bound quote token does double duty as the integrity
 * check between the two calls: rates are quoted against the OWNER's address,
 * so `verifyQuote` re-derives that same address hash here. A quote minted for
 * any other address — including a genuine, correctly-signed one the buyer
 * obtained from the ordinary checkout for their own home — cannot be spent on
 * a gift order.
 *
 * NEVER THROWS OUT: `getGiftShippingRates` degrades to `[]` (the gift
 * checkout UI treats that as "shipping unavailable", exactly as the ordinary
 * checkout does) and `placeGiftOrder` to a typed `{ ok: false, error }` with
 * fixed, non-leaking copy.
 */

const selectionSchema = z.object({
  productId: z.string().min(1).max(64),
  variantId: z.string().min(1).max(64).nullable(),
})

/**
 * `max(50)` is an abuse cap, not a product rule: a wishlist is a handful of
 * items, and each selection costs a catalog row and an order line.
 */
const ratesSchema = z.object({
  shareToken: z.string().min(1).max(128),
  selections: z.array(selectionSchema).min(1).max(50),
  email: z.email(),
  chargeCurrency: z.enum(['NGN', 'USD']),
})

const placeSchema = ratesSchema.extend({ shippingToken: z.string().min(1) })

const NOT_ACCEPTING: CreateGiftOrderResult = { ok: false, error: 'This wishlist is no longer accepting gifts.' }
const GENERIC_ERROR: CreateGiftOrderResult = { ok: false, error: 'Something went wrong. Please try again.' }
const QUOTE_EXPIRED: CreateGiftOrderResult = { ok: false, error: 'Shipping quote expired. Please try again.' }
const RATE_LIMITED: CreateGiftOrderResult = { ok: false, error: RATE_LIMITED_MESSAGE }

/**
 * The ONE place a `ResolvedShare` becomes a checkout `Address`. Both actions
 * go through it so the address `getShippingRates` quotes against and the
 * address `verifyQuote` re-derives its hash from are byte-identical by
 * construction — if they could drift, every legitimate gift quote would fail
 * verification at placement.
 */
function destinationOf(share: ResolvedShare): Address {
  return {
    fullName: share.address.fullName,
    phone: share.address.phone,
    line1: share.address.line1,
    line2: share.address.line2 ?? undefined,
    city: share.address.city,
    state: share.address.state,
    country: share.address.country,
    postalCode: share.address.postalCode ?? undefined,
  }
}

/**
 * Keeps only selections actually on the shared wishlist and turns them into
 * quantity-1 lines. `createGiftOrder` filters again against the same
 * `share.productIds` — this is not redundant: the two calls are independent
 * requests and the list can change between them, and neither function may
 * depend on the other having filtered.
 */
function giftLines(share: ResolvedShare, selections: z.infer<typeof selectionSchema>[]) {
  const onList = new Set(share.productIds)
  return selections
    .filter((selection) => onList.has(selection.productId))
    .map((selection) => ({ productId: selection.productId, variantId: selection.variantId ?? undefined, quantity: 1 }))
}

export async function getGiftShippingRates(input: unknown): Promise<ShippingOption[]> {
  if (!(await checkRateLimit('wishlistShare'))) return []

  const parsed = ratesSchema.safeParse(input)
  if (!parsed.success) return []

  const share = await resolveShare(parsed.data.shareToken)
  if (!share) return []

  const lines = giftLines(share, parsed.data.selections)
  if (lines.length === 0) return []

  // `lines` (not `guestLines`) — the explicit override added for this flow.
  // The buyer's own cart is irrelevant to a gift order, and a signed-in
  // buyer's cart would otherwise be the thing quoted.
  return getShippingRates({
    address: destinationOf(share),
    email: parsed.data.email,
    chargeCurrency: parsed.data.chargeCurrency,
    lines,
  })
}

export async function placeGiftOrder(input: unknown): Promise<CreateGiftOrderResult> {
  if (!(await checkRateLimit('wishlistShare'))) return RATE_LIMITED

  const parsed = placeSchema.safeParse(input)
  if (!parsed.success) return GENERIC_ERROR

  const share = await resolveShare(parsed.data.shareToken)
  // One neutral message for an unknown token, a disabled share, and a share
  // whose address was deleted — `resolveShare` collapses all three to null on
  // purpose, and this copy must not un-collapse them.
  if (!share) return NOT_ACCEPTING

  // The quote must have been minted for the OWNER's address. `verifyQuote`
  // re-derives the address hash, so a token bought for any other destination
  // fails here — this is what stops a buyer swapping in their own quote.
  //
  // `verifyQuote` throws — deliberately, per its own doc comment — on a
  // missing `SHIPBUBBLE_QUOTE_SECRET` (a server misconfiguration), and
  // `token.split('.')` inside it throws on a nullish token. `safeParse` above
  // already guarantees a non-empty string here, but the secret is env, not
  // input, so the try/catch stays: this module's never-throws-out contract
  // holds even on a misconfigured server.
  let quote: ReturnType<typeof verifyQuote>
  try {
    quote = verifyQuote(parsed.data.shippingToken, destinationOf(share))
  } catch (error) {
    console.error('[placeGiftOrder] verifyQuote threw (likely a missing SHIPBUBBLE_QUOTE_SECRET)', error)
    return GENERIC_ERROR
  }
  if (!quote) return QUOTE_EXPIRED
  if (quote.currency !== parsed.data.chargeCurrency) return GENERIC_ERROR

  return createGiftOrder({
    share,
    selections: parsed.data.selections,
    email: parsed.data.email,
    chargeCurrency: parsed.data.chargeCurrency,
    quote: { label: quote.label, amountMinor: quote.amountMinor, currency: quote.currency },
  })
}
