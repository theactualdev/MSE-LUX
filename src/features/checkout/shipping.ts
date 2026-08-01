'use server'

import { buildShippingRates } from '@/features/checkout/lib/shipping-rates'
import type { ShippingRatesInput } from '@/features/checkout/lib/shipping-rates'
import type { ShippingOption } from '@/features/checkout/shipping-types'

/**
 * `getShippingRates`: the client calls this right after the address step to
 * get selectable, server-signed shipping options. It is a THIN WRAPPER — all
 * of the rate-building (ShipBubble, flat rates, fallbacks, signing) lives in
 * `lib/shipping-rates.ts`, which carries the full docblock for that behaviour.
 *
 * WHY `'use server'` RATHER THAN `import 'server-only'`: same reasoning as
 * `data.ts` — this is a Server Action called directly from the client
 * checkout flow, so it's a public HTTP endpoint. It carries no secret beyond
 * each option's opaque signed `token`; the ShipBubble API key and the quote
 * HMAC secret are read only inside the server-only modules this calls
 * (`lib/shipping-rates.ts` -> `lib/shipbubble.ts`, `lib/shipping-quote.ts`),
 * never here.
 *
 * WHY THE IMPLEMENTATION IS NOT IN THIS FILE (Phase 10c fix, round 3). EVERY
 * export of a `'use server'` module is a public HTTP endpoint, and every
 * argument of those exports comes off the wire — including any field of this
 * `input` object. While the quote's `scope` was such a field, an attacker
 * could mint a validly-signed GIFT-scoped token for an address of their own
 * choosing and then probe `placeGiftOrder` with it, reading the recipient's
 * hidden `line1`/`postalCode` back out of the pass/fail difference (see
 * `ShippingQuotePayload.scope`). The scope is therefore no longer part of any
 * wire shape: this action hardcodes `'checkout'` below, and the gift flow
 * calls `buildShippingRates` directly with `'gift'` — never through this
 * action — so there is no request that can produce a gift-scoped token.
 *
 * NEVER THROWS — see `buildShippingRates`, which owns that contract (a
 * ShipBubble outage degrades to a flat fallback option; an unsignable quote
 * degrades to `[]`).
 */
export async function getShippingRates(input: ShippingRatesInput): Promise<ShippingOption[]> {
  // `'checkout'` is a LITERAL here, deliberately: it is not read from `input`
  // and there is no code path by which a caller can influence it. A caller
  // that POSTs an extra `scope: 'gift'` key gets a checkout-scoped token like
  // everyone else — the key is simply never read.
  return buildShippingRates(input, { scope: 'checkout' })
}
