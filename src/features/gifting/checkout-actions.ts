'use server'

import { z } from 'zod'
import { checkRateLimit, RATE_LIMITED_MESSAGE } from '@/lib/rate-limit'
import { resolveShare } from '@/features/gifting/share'
import { createGiftOrder } from '@/features/gifting/gift-order'
import type { CreateGiftOrderResult } from '@/features/gifting/gift-order'
import { buildShippingRates } from '@/features/checkout/lib/shipping-rates'
import { verifyQuote, shareRefFor } from '@/features/checkout/lib/shipping-quote'
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
 * WHY THE QUOTE IS ALSO BOUND TO THE SHARE (Phase 10c fix, round 3). Address
 * binding plus `scope: 'gift'` still left one door open, because minting a
 * gift-scoped quote for an address you control is a legitimate operation:
 * `enableShare` lets any account pin ANY address it owns. An attacker could
 * therefore save a GUESSED street as their own address, share their own
 * wishlist, take a real gift quote against it, and then present that token
 * HERE, against the victim's share — where a wrong guess fails `verifyQuote`
 * and a right guess passes, turning the pair of outcomes back into an
 * equality oracle for the recipient's hidden `line1`/`postalCode`. Every gift
 * quote now carries `shareRef` (`ShippingQuotePayload.shareRef`), the HMAC of
 * the share token it was quoted for, and `placeGiftOrder` requires it to
 * match the share being spent against — so a token minted at one share is
 * inert at every other.
 *
 * AND WHY EVERY REJECTION AFTER `verifyQuote` RETURNS THE SAME STRING: an
 * oracle needs two distinguishable outcomes, so the quote checks below
 * deliberately collapse into ONE message (`QUOTE_EXPIRED`). See the comments
 * at those checks.
 *
 * EVERY EXPECTED FAILURE IS A TYPED RESULT, never a throw:
 * `getGiftShippingRates` degrades to `[]` (the gift checkout UI treats that as
 * "shipping unavailable", exactly as the ordinary checkout does) and
 * `placeGiftOrder` to a typed `{ ok: false, error }` with fixed, non-leaking
 * copy — including the misconfigured-server case where `verifyQuote` throws,
 * which is caught explicitly below. A genuinely UNEXPECTED error still
 * propagates (`createGiftOrder` rethrows an unrecognized DB error;
 * `resolveShare` can throw on a DB failure) — deliberately, and exactly as
 * `placeOrder` behaves: those are bugs or outages, not refusals, and
 * swallowing them into "please try again" would hide them.
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
 * Keeps only selections actually on the shared wishlist, COLLAPSES DUPLICATES,
 * and turns what's left into quantity-1 lines. `createGiftOrder` filters and
 * collapses again against the same `share.productIds` — this is not redundant:
 * the two calls are independent requests and the list can change between them,
 * and neither function may depend on the other having done it.
 *
 * The dedupe uses the SAME `productId::variantId` map key as
 * `gift-order.ts`'s `allowedSelections`, and that is the point: without it the
 * two functions describe different packages for the same request. A crafted
 * request repeating one productId 50 times (the schema's own cap) quoted a
 * 50-unit package here, while `createGiftOrder` collapsed it to a single
 * qty-1 line — so the buyer was charged the inflated shipping of a package the
 * order never contained. Quote and order must agree by construction.
 */
function giftLines(share: ResolvedShare, selections: z.infer<typeof selectionSchema>[]) {
  const onList = new Set(share.productIds)
  const byKey = new Map<string, { productId: string; variantId: string | undefined; quantity: number }>()

  for (const selection of selections) {
    if (!onList.has(selection.productId)) continue
    // Rule 3 (`gift-order.ts`): a wishlist has no quantity, so a repeated
    // selection is ONE gift — quantity stays 1, it never adds up.
    byKey.set(`${selection.productId}::${selection.variantId ?? ''}`, {
      productId: selection.productId,
      variantId: selection.variantId ?? undefined,
      quantity: 1,
    })
  }

  return Array.from(byKey.values())
}

export async function getGiftShippingRates(input: unknown): Promise<ShippingOption[]> {
  if (!(await checkRateLimit('wishlistShare'))) return []

  const parsed = ratesSchema.safeParse(input)
  if (!parsed.success) return []

  const share = await resolveShare(parsed.data.shareToken)
  if (!share) return []

  const lines = giftLines(share, parsed.data.selections)
  if (lines.length === 0) return []

  // Binds every token minted below to THIS share (see the module docblock).
  // `shareRefFor` throws on a missing `SHIPBUBBLE_QUOTE_SECRET` — a server
  // misconfiguration, not a bad input — and this action must never throw out,
  // so it degrades to the same `[]` that `buildShippingRates` itself returns
  // when it finds it cannot sign (the gift checkout UI reads `[]` as
  // "shipping unavailable").
  let shareRef: string
  try {
    shareRef = shareRefFor(parsed.data.shareToken)
  } catch (error) {
    console.error('[getGiftShippingRates] cannot derive shareRef (likely a missing SHIPBUBBLE_QUOTE_SECRET)', error)
    return []
  }

  // `buildShippingRates` DIRECTLY, never the public `getShippingRates` action:
  // the stamp below is a second argument of a server-only function, so no HTTP
  // request can supply it. Routing through the action would put `scope` back
  // on the wire and reopen the oracle (see `shipping.ts`'s docblock).
  //
  // `lines` (not `guestLines`) — the explicit override added for this flow.
  // The buyer's own cart is irrelevant to a gift order, and a signed-in
  // buyer's cart would otherwise be the thing quoted.
  return buildShippingRates(
    {
      address: destinationOf(share),
      email: parsed.data.email,
      chargeCurrency: parsed.data.chargeCurrency,
      lines,
    },
    // Stamps every returned option's token with `scope: 'gift'` AND this
    // share's `shareRef` — see `ShippingQuotePayload`. Together they make the
    // token unusable at `placeOrder` and unusable at any share but this one,
    // so a buyer holding it cannot pair it with a guessed address anywhere and
    // read the answer back.
    { scope: 'gift', shareRef },
  )
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
  let expectedShareRef: string
  try {
    quote = verifyQuote(parsed.data.shippingToken, destinationOf(share))
    // Same secret, same throw-on-misconfiguration contract, so it belongs in
    // the same try. In practice it cannot throw here — `verifyQuote` already
    // required the secret on the line above.
    expectedShareRef = shareRefFor(parsed.data.shareToken)
  } catch (error) {
    console.error('[placeGiftOrder] verifyQuote threw (likely a missing SHIPBUBBLE_QUOTE_SECRET)', error)
    return GENERIC_ERROR
  }
  if (!quote) return QUOTE_EXPIRED

  // Symmetric to the check `placeOrder` (`checkout/data.ts`) makes: a token
  // minted by the ORDINARY checkout flow (`getShippingRates` with no
  // `scope`, or explicitly `scope: 'checkout'`) must not be spendable here.
  // Without this, a buyer could quote a normal checkout address for
  // themselves and hand that (genuinely signed) token to `placeGiftOrder`
  // instead of a gift-scoped one — not the address-oracle hazard `placeOrder`
  // guards against (this action never takes a caller-supplied address to
  // compare against), but still a token this action was never meant to
  // accept. No backwards-compatibility fallback for a missing `scope` here,
  // unlike `placeOrder`'s: the gift flow's `getGiftShippingRates` starts
  // stamping `scope: 'gift'` on every token it mints in this SAME deploy, so
  // there is no pre-existing gift token this would need to keep working for.
  if (quote.scope !== 'gift') return QUOTE_EXPIRED

  // ...and it must have been minted for THIS share, not merely for some
  // gift-scoped address that happens to match. Without this, an attacker can
  // still mint a legitimately gift-scoped token bound to an address of their
  // own choosing — `enableShare` pins any address the caller owns — and probe
  // the victim's share with it: a wrong guess fails `verifyQuote` above, a
  // right guess falls through, and the difference is the address oracle all
  // over again (see the module docblock).
  //
  // Compared against the SAME `QUOTE_EXPIRED` constant every other quote
  // rejection uses, never a distinct message: a distinguishable outcome here
  // would simply be the oracle one level up.
  if (quote.shareRef !== expectedShareRef) return QUOTE_EXPIRED

  // A currency mismatch is ALSO `QUOTE_EXPIRED` rather than `GENERIC_ERROR`,
  // and that is a security choice, not a copy choice. It used to be the one
  // remaining pair of distinguishable outcomes downstream of a valid
  // signature: an attacker holding a gift token could deliberately send the
  // WRONG `chargeCurrency`, and then a wrong address/share guess returned
  // "quote expired" while a right guess returned "something went wrong" —
  // two distinct strings, no order written either way, i.e. exactly the
  // free equality oracle for the recipient's `line1`/`postalCode` that the
  // scope and share bindings above exist to close. Every rejection between a
  // resolved share and a created order therefore speaks with ONE voice; the
  // only remaining way to tell states apart is to actually hold a valid quote
  // for this share, which is to say to be a legitimate buyer.
  if (quote.currency !== parsed.data.chargeCurrency) return QUOTE_EXPIRED

  return createGiftOrder({
    share,
    selections: parsed.data.selections,
    email: parsed.data.email,
    chargeCurrency: parsed.data.chargeCurrency,
    quote: { label: quote.label, amountMinor: quote.amountMinor, currency: quote.currency },
  })
}
