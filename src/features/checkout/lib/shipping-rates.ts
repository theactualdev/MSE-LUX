import 'server-only'

import { db } from '@/lib/db'
import { getCurrentUserId } from '@/features/auth/claims'
import { resolveProductsByIds } from '@/features/catalog/server/resolve-products'
import { validateAddress, fetchRates } from '@/features/checkout/lib/shipbubble'
import { signQuote, addressHash, newQuoteSalt } from '@/features/checkout/lib/shipping-quote'
import { getUsdNgnRate, usdMinorFromNgnMinor } from '@/features/checkout/lib/shipping-fx'
import { serverChargeCurrency } from '@/features/currency/lib/charge-currency-server'
import { checkRateLimit } from '@/lib/rate-limit'
import {
  SHIPBUBBLE_ORIGIN_ADDRESS_CODE,
  FLAT_INTERNATIONAL_USD,
  FLAT_INTERNATIONAL_NGN,
  FLAT_FALLBACK_NGN,
  FLAT_FALLBACK_USD,
  WEIGHT_BASE_GRAMS,
  WEIGHT_PER_ITEM_GRAMS,
  NOMINAL_DIMENSION,
} from '@/features/checkout/lib/shipping-config'
import { addressSchema } from '@/features/checkout/schema'
import type { Address } from '@/features/checkout/schema'
import type { GuestOrderLine } from '@/features/checkout/types'
import type { ShippingOption } from '@/features/checkout/shipping-types'

/**
 * `buildShippingRates`: the rate-building engine behind BOTH quote flows —
 * `getShippingRates` (`../shipping.ts`, the ordinary checkout Server Action)
 * and `getGiftShippingRates` (`gifting/checkout-actions.ts`). It returns
 * selectable, server-signed shipping options — live ShipBubble courier rates
 * for BOTH currencies and ANY destination — ShipBubble quotes international
 * routes from Lagos too (verified against the production API), and a USD
 * charge converts those naira amounts through `shipping-fx.ts` — plus a flat
 * fallback whenever the ShipBubble path can't complete. Every option's
 * currency equals `input.chargeCurrency` — ALWAYS the client's own
 * format-validated value, never the address's country and, since Phase 9c
 * Task 4, never the server geo signal either (see the currency-resolution
 * comment inside the function body for why) — so `placeOrder`'s currency
 * guard always passes for a legit flow. This mirrors `placeOrder`'s
 * cart-resolution idiom (`data.ts`) exactly, but is read-only: no order, no
 * inventory clamp, no DB write — it only reads the cart to size the ShipBubble
 * package (weight + declared value).
 *
 * WHY `import 'server-only'` RATHER THAN `'use server'` — AND WHY THIS MODULE
 * EXISTS AT ALL (Phase 10c fix, round 3). This code used to live directly in
 * `shipping.ts`, which is a `'use server'` module: EVERY export of such a
 * module is a public HTTP endpoint, and every argument of those exports comes
 * off the wire. That made the quote `stamp` below — specifically
 * `scope: 'gift'` — settable by any caller, which handed an attacker a
 * gift-scoped token bound to an address of their own choosing and reopened
 * exactly the oracle `scope` was introduced to close (see `ShippingQuotePayload`
 * for the full attack). `scope` and `shareRef` are therefore NOT fields of the
 * wire input: they are separate parameters of a function no HTTP request can
 * reach. `shipping.ts` hardcodes `'checkout'`; `getGiftShippingRates` calls
 * this function DIRECTLY (never through the public action) with `'gift'` and
 * the `shareRef` of the share it just resolved server-side.
 *
 * NEVER THROWS: any failure in the ShipBubble path (address validation,
 * rate fetch, missing config, empty courier list) is caught and turned into
 * a single flat fallback option instead — checkout must never be blocked by
 * a shipping-API outage.
 *
 * A missing `SHIPBUBBLE_QUOTE_SECRET` is a SEPARATE hazard from the above:
 * every option this function returns is signed (`toOption` -> `signQuote`),
 * INCLUDING the top-level catch's own last-resort `guardFallbackOption`
 * call — so without the check at the top of that catch below, the
 * fallback-building itself would throw a second time and escape as an
 * unhandled rejection (this was the exact 500 QA reported). The top-level
 * catch is where every throwing path in this function ultimately lands, so
 * guarding ONLY there is enough to keep the whole function's "never throws"
 * contract even when signing is impossible — see `hasQuoteSecret` below.
 *
 * Since Phase 10c `addressHash` is KEYED with that same secret (it was an
 * unsalted digest, which made the token an offline oracle for the recipient's
 * street address — see `shipping-quote.ts`), so it now throws on a missing
 * secret too. That changes WHICH line throws first on an unconfigured server,
 * never whether the throw is contained: every `addressHash` call site here is
 * a place that would have thrown moments later at `signQuote` anyway, they all
 * sit inside the top-level try, and the one call the top-level CATCH makes
 * (`guardFallbackOption` -> `safeAddressHash`) is already behind the
 * `hasQuoteSecret()` early-return AND inside that catch's own inner try.
 */

/** Quote validity window — matches the plan's "e.g. 30 min" quote lifetime. */
const QUOTE_TTL_MS = 30 * 60 * 1000

/**
 * The flow-identifying fields stamped onto every signed payload this module
 * mints. NOT part of `ShippingRatesInput` on purpose: the input is the wire
 * shape a public Server Action forwards verbatim, and neither of these may
 * ever be caller-controlled (see this module's docblock). Both are supplied
 * by the trusted server-side caller as a separate argument.
 */
export interface QuoteStamp {
  /**
   * Which flow is asking — `'checkout'` for the ordinary address-entry step,
   * `'gift'` for `getGiftShippingRates`. See `ShippingQuotePayload.scope`.
   */
  scope: 'checkout' | 'gift'
  /**
   * Gift flow only: the HMAC reference (`shareRefFor`) of the share token the
   * quote was produced for. See `ShippingQuotePayload.shareRef`. Always
   * `undefined` on the checkout path — a checkout quote belongs to no share.
   */
  shareRef?: string
}

/** The wire-shaped half of a rate request — every field of it is caller-supplied and untrusted. */
export interface ShippingRatesInput {
  address: Address
  /** ShipBubble requires a contact email for address validation; the checkout flow already has it by the shipping step. */
  email: string
  /**
   * The customer's own chosen charge currency (Phase 5d/6) — set by the
   * `CurrencySwitcher` in the header, independent of the shipping address.
   * Every returned option's `currency` (and its token's payload currency)
   * equals this exactly: never the address's country, and, since Phase 9c
   * Task 4, never the server-observed geo signal either (`serverChargeCurrency`
   * is still read below, but only to log a divergence — see that comment for
   * why overriding from geo was reverted). So `placeOrder`'s
   * `quote.currency !== input.chargeCurrency` guard always passes for a
   * legit flow: live ShipBubble rates are used for either currency at any
   * destination, converted to USD when that is the charge currency, and every
   * fallback is likewise denominated in `chargeCurrency`.
   */
  chargeCurrency: 'NGN' | 'USD'
  guestLines?: GuestOrderLine[]
  /**
   * Pre-resolved, SERVER-VALIDATED lines used verbatim instead of resolving
   * from the caller's cart. The gift flow (Phase 10c) supplies these because
   * the buyer's OWN cart is irrelevant to a gift order — without this, a
   * signed-in buyer would have their own cart quoted instead of the gift.
   * Never populate this from unvalidated client input: the gift caller
   * derives it from the share token's wishlist membership.
   *
   * When supplied it bypasses `resolveRawLines` ENTIRELY — no session lookup,
   * no cart read — so neither a signed-in caller's server cart nor a guest's
   * `guestLines` can contribute a line to the quoted package.
   *
   * `getShippingRates` IS a public Server Action, so a hostile caller can of
   * course send `lines` directly and have a signed-in session's own cart
   * skipped — worth stating plainly, because `guestLines` deliberately does
   * NOT allow that. It grants no capability that wasn't already reachable: a
   * quote token is bound to the ADDRESS, an amount and an expiry — never to a
   * cart or a session — so anyone wanting a cheaper courier quote could
   * already get one by calling that action with a light `guestLines` while
   * signed out and spending the token afterwards. Under-declaring the package
   * therefore costs shipping accuracy, exactly as it already could, and
   * nothing more: every ORDER line is still re-priced from the authored
   * catalog at placement (`placeOrder` / `createGiftOrder`), so no item price,
   * subtotal or total can be moved from here.
   */
  lines?: GuestOrderLine[]
}

/** Normalizes `address.country` to decide the Nigeria vs. rest-of-world branch. */
function isNigeria(country: string): boolean {
  const normalized = country.trim().toLowerCase()
  return normalized === 'nigeria' || normalized === 'ng'
}

/**
 * The raw (unclamped, unpriced) line tuples to build the package from — the
 * signed-in user's persisted server cart, or the guest's client-supplied
 * lines when there is no session. Identical scoping to `data.ts`'s
 * `resolveRawLines`: a signed-in caller's `guestLines` are ignored entirely.
 */
async function resolveRawLines(userId: string | null, guestLines: GuestOrderLine[] | undefined): Promise<GuestOrderLine[]> {
  if (!userId) return guestLines ?? []

  const rows = await db.cartItem.findMany({
    where: { cart: { profileId: userId } },
    select: { productId: true, variantId: true, quantity: true },
  })

  return rows.map((row) => ({ productId: row.productId, variantId: row.variantId ?? undefined, quantity: row.quantity }))
}

/** Collapses duplicate `(productId, variantId)` tuples into one, summing quantities — same rationale as `data.ts`'s `aggregateRawLines`. */
function aggregateRawLines(rawLines: GuestOrderLine[]): GuestOrderLine[] {
  const byKey = new Map<string, GuestOrderLine>()

  for (const line of rawLines) {
    const key = `${line.productId}::${line.variantId ?? ''}`
    const existing = byKey.get(key)
    if (existing) {
      existing.quantity += line.quantity
    } else {
      byKey.set(key, { ...line })
    }
  }

  return Array.from(byKey.values())
}

/**
 * Signs a `{ label, amountMinor, currency, addressHash, salt, exp, ...stamp }`
 * payload into a full `ShippingOption`. `hash` and `salt` MUST be the exact
 * pair produced together by one `addressHash(address, salt)` call — every
 * call site below mints its salt with `newQuoteSalt()` immediately before
 * hashing, precisely so the salt threaded into the payload here is the same
 * one the hash was computed under (see `shipping-quote.ts`'s docblock for why
 * a mismatched pair would defeat the salt's whole purpose).
 *
 * `stamp` records which flow this quote is good for and, on the gift path,
 * WHICH SHARE it was quoted for — so both travel with every option this
 * module returns, ordinary or fallback alike. See `ShippingQuotePayload`'s
 * `scope` and `shareRef` doc comments for the full rationale: without them, a
 * gift-scoped token could be pointed at an address, or at a share, it was
 * never minted for, and the pass/fail difference read back as a free online
 * oracle for the recipient's hidden `line1`/`postalCode`.
 */
function toOption(
  id: string,
  label: string,
  amountMinor: number,
  currency: 'NGN' | 'USD',
  hash: string,
  salt: string,
  stamp: QuoteStamp,
  deliveryEta?: string,
): ShippingOption {
  const exp = Date.now() + QUOTE_TTL_MS
  const token = signQuote({ label, amountMinor, currency, addressHash: hash, salt, exp, scope: stamp.scope, shareRef: stamp.shareRef })
  return { id, label, amountMinor, currency, deliveryEta, token }
}

/** `YYYY-MM-DD` for tomorrow — ShipBubble's `pickup_date`, kept a day out so a same-day cutoff never fails the quote. */
function tomorrowIsoDate(): string {
  return new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

/**
 * `addressHash` is safe on a well-formed `Address` (every field is normalized
 * with `?? ''`), but this function's input reaches it straight off a public
 * Server Action — callers don't runtime-validate their args, so `input.address`
 * can arrive as `null`/`undefined`/a non-object, OR as an object whose
 * individual fields are the WRONG type (e.g. `{ line1: 123 }`) at the
 * boundary. Guarding only the container isn't enough: `addressHash`'s
 * normalize is `(value ?? '').trim().toLowerCase()`, so a present-but-non-string
 * field (`(123).trim()`) still throws. Every field is therefore individually
 * coerced to a string here — never passed through untyped — so a guard-path
 * fallback option can always be built (and later re-verified with
 * `verifyQuote`) without risking a second throw while we're already handling
 * the first one.
 *
 * Returns the hash TOGETHER WITH the salt it was computed under — `salt` is
 * generated fresh right here with `newQuoteSalt()` — so the caller has the
 * exact pair `toOption` needs; it can never accidentally sign a hash against
 * a different salt than the one that produced it.
 */
function safeAddressHash(address: unknown): { hash: string; salt: string } {
  const src = address && typeof address === 'object' ? (address as Record<string, unknown>) : {}
  const str = (value: unknown) => (typeof value === 'string' ? value : '')
  const salt = newQuoteSalt()
  const hash = addressHash(
    {
      line1: str(src.line1),
      city: str(src.city),
      state: str(src.state),
      country: str(src.country),
      postalCode: str(src.postalCode),
    } as Address,
    salt,
  )
  return { hash, salt }
}

/**
 * The single flat rate returned whenever the request can't even be processed
 * (malformed address, or any other unexpected throw) — in `chargeCurrency`,
 * defaulting to NGN if `chargeCurrency` is itself somehow invalid at this
 * boundary. A genuinely malformed address will be rejected again by
 * `placeOrder`'s own `addressSchema.safeParse` before anything is charged.
 */
/**
 * The flat rate to fall back on, chosen by charge currency AND destination.
 *
 * Destination started mattering the moment NGN orders to non-Nigerian
 * addresses began being quoted live. Before that, every NGN request that
 * reached a fallback was domestic by construction, so `FLAT_FALLBACK_NGN`
 * was always right. Now a ShipBubble outage on an international NGN order
 * would hand out the DOMESTIC rate — measured against the live API that is
 * ₦2,500 for a parcel really costing about ₦78,000 to New York. The store
 * would eat the difference on precisely its most valuable orders, and
 * nothing would look broken.
 *
 * An unparseable address keeps the domestic rate: `placeOrder` re-validates
 * with this same schema and refuses the order, so no such quote can ever be
 * charged, and preserving the previous behaviour keeps this change to the
 * one case it is about.
 */
function flatFallbackFor(address: unknown, chargeCurrency: unknown) {
  if (chargeCurrency === 'USD') return FLAT_FALLBACK_USD

  const parsed = addressSchema.safeParse(address)
  const domestic = !parsed.success || isNigeria(parsed.data.country)
  return domestic ? FLAT_FALLBACK_NGN : FLAT_INTERNATIONAL_NGN
}

function guardFallbackOption(address: unknown, chargeCurrency: unknown, stamp: QuoteStamp): ShippingOption {
  const { hash, salt } = safeAddressHash(address)
  const fallback = flatFallbackFor(address, chargeCurrency)
  return toOption('fallback', fallback.label, fallback.amountMinor, fallback.currency, hash, salt, stamp, fallback.deliveryEta)
}

/**
 * Checked directly against `process.env` (never via `signQuote`'s own
 * `requireSecret()`) so the top-level catch can detect an unsignable state
 * WITHOUT itself throwing — that's the whole point of this check existing.
 */
function hasQuoteSecret(): boolean {
  return !!process.env.SHIPBUBBLE_QUOTE_SECRET
}

export async function buildShippingRates(input: ShippingRatesInput, stamp: QuoteStamp): Promise<ShippingOption[]> {
  // `input` reaches this function straight off a public Server Action, which
  // a caller can POST with no body at all (or any other falsy value), making
  // it `undefined`/`null` at this boundary despite the compile-time type.
  // Normalized ONCE, before the top-level try, so every reference below —
  // including the top-level catch's own last-resort `guardFallbackOption`
  // call — reads from this safe value instead of risking
  // `input.chargeCurrency` throwing a SECOND time while the catch is already
  // handling the first throw (the exact "double-throw" that used to escape as
  // an unhandled rejection when `input` was nullish).
  //
  // `stamp` needs no such normalization: it never comes off the wire (see the
  // module docblock) — it is always a literal supplied by a server-side
  // caller.
  const safeInput = (input ?? {}) as Partial<ShippingRatesInput>

  try {
    // Phase 9c originally OVERRODE the client's currency with the server geo
    // signal whenever the two disagreed. That was wrong for this product and
    // has been reverted (Phase 9c Task 4) — same rationale as `placeOrder`
    // (`data.ts`, see its currency-resolution comment for the full writeup):
    // the charge currency is a designed customer choice (`CurrencySwitcher`,
    // `charge-currency-note`), overriding it silently contradicts what the
    // UI just told the customer, and both authored currencies are
    // merchant-set with no FX in this path, so a divergence is a pricing
    // question, not a security hole. The effective currency is therefore
    // ALWAYS `input.chargeCurrency` — driving this function's whole
    // NGN-vs-international branching and every returned option/token's
    // currency — and stays consistent with what `placeOrder` uses for the
    // same request (see its quote-currency guard comment). The server signal
    // is still read and compared, but ONLY to log a divergence for merchant
    // observability; it never changes behaviour. Computed once, up front, so
    // every branch below — including the rate-limited fallback — sees the
    // same resolved value.
    const serverCurrency = await serverChargeCurrency()
    const chargeCurrency: 'NGN' | 'USD' | undefined = safeInput.chargeCurrency
    if (serverCurrency && serverCurrency !== chargeCurrency) {
      console.warn('[getShippingRates] charge-currency divergence — logging only, using the client currency', {
        client: chargeCurrency,
        server: serverCurrency,
      })
    }

    // A shipping quote is not worth breaking checkout over: on a limit hit,
    // degrade EXACTLY like a ShipBubble outage does — log and hand back a
    // flat-fallback option rather than an empty list or a thrown error. This
    // function's contract is that it never throws and always resolves
    // `ShippingOption[]`, so the rate-limit guard must honour that contract
    // too — which is why it lives HERE, as the first thing inside the
    // top-level try, rather than above it:
    // `guardFallbackOption` -> `signQuote` -> `requireSecret()` throws when
    // `SHIPBUBBLE_QUOTE_SECRET` is unset, so outside this try that throw
    // would escape `buildShippingRates` entirely on a limited request.
    //
    // Own window (`shippingQuote`, Phase 9c final fixes), split from
    // `placeOrder`'s `checkout` window: this is a read-only quote lookup, not
    // a write, and shares `checkout` before the split meant a handful of
    // concurrent legitimate checkouts behind one carrier NAT could exhaust it
    // with no attacker involved — silently downgrading a real customer to a
    // flat rate instead of the true courier price. See `RATE_LIMITS` in
    // `lib/rate-limit.ts` for the full rationale.
    if (!(await checkRateLimit('shippingQuote'))) {
      console.error('getShippingRates: rate limited, falling back to a flat rate')

      // Don't let a limit hit ship an international order at the domestic
      // flat rate: if the address parses and the real (un-limited) path
      // below would take the international branch — i.e. this is a USD
      // charge (always international, any address), or an NGN charge to a
      // NON-Nigerian destination — return the SAME signed international
      // option that branch would build, never the cheaper, mislabeled flat
      // fallback that `guardFallbackOption` would otherwise pick on currency
      // alone.
      //
      // This condition DELIBERATELY no longer mirrors the live branch below,
      // which now short-circuits on charge currency alone. Being rate limited
      // means ShipBubble cannot be called at all, so an NGN order to a
      // non-Nigerian address still has to be priced from a flat rate here —
      // and it must be the INTERNATIONAL flat, never the domestic one.
      const parsedForLimit = addressSchema.safeParse(safeInput.address)
      if (parsedForLimit.success && (chargeCurrency !== 'NGN' || !isNigeria(parsedForLimit.data.country))) {
        const flat = chargeCurrency === 'USD' ? FLAT_INTERNATIONAL_USD : FLAT_INTERNATIONAL_NGN
        const limitSalt = newQuoteSalt()
        const limitHash = addressHash(parsedForLimit.data, limitSalt)
        return [
          toOption(
            'international',
            flat.label,
            flat.amountMinor,
            flat.currency,
            limitHash,
            limitSalt,
            stamp,
            flat.deliveryEta,
          ),
        ]
      }

      return [guardFallbackOption(safeInput.address, chargeCurrency, stamp)]
    }

    // `safeInput.address` is untrusted at this boundary (it arrives through a
    // public Server Action — no runtime arg validation happens for us, and
    // `safeInput` itself only guards against a nullish `input`, not a
    // malformed `address` within it). A malformed/missing address must not
    // throw straight out of the function; it gets one safe flat option
    // instead, exactly like any other unrecoverable failure below.
    const parsedAddress = addressSchema.safeParse(safeInput.address)
    if (!parsedAddress.success) return [guardFallbackOption(safeInput.address, chargeCurrency, stamp)]

    const address = parsedAddress.data
    const { email, guestLines, lines } = safeInput
    const salt = newQuoteSalt()
    const hash = addressHash(address, salt)

    // ShipBubble quotes in NGN — but it quotes INTERNATIONAL routes too, which
    // this branch used to assume it did not. Verified against the production
    // API: a 0.45 kg parcel from the Lagos origin returns 14 domestic couriers
    // (cheapest ₦1,953) and 7 to New York (cheapest ₦78,475, Aramex via
    // Topship). Destination genuinely moves the price; the sandbox's
    // destination-blind stub rates are what made it look otherwise.
    //
    // Charge currency no longer forces a flat rate either. A USD customer is
    // quoted the same live couriers and the NGN amount is converted at
    // `shipping-fx.ts`'s daily rate plus a margin — see that module for why
    // the display-FX provider could not be reused (it has no NGN rate at all).
    //
    // Both currencies therefore take the live path below; only a failure in it
    // still yields a flat rate.
    try {
      // A blank origin code means the store's ShipBubble pickup address hasn't
      // been configured yet — fail fast into the fallback rather than calling
      // ShipBubble with an invalid sender code.
      if (!SHIPBUBBLE_ORIGIN_ADDRESS_CODE) throw new Error('SHIPBUBBLE_ORIGIN_ADDRESS_CODE is not configured')

      // An explicit `lines` override short-circuits cart resolution
      // completely — `getCurrentUserId()` is not even called, so a signed-in
      // gift buyer's own cart is never read, let alone quoted (see the
      // `lines` field's doc comment above).
      const rawLines = lines ?? (await resolveRawLines(await getCurrentUserId(), guestLines))
      const aggregatedLines = aggregateRawLines(rawLines)

      const productIds = Array.from(new Set(aggregatedLines.map((line) => line.productId)))
      const products = await resolveProductsByIds(productIds)
      const productById = new Map(products.map((p) => [p.id, p]))

      // Declared/insured value and the package weight, both driven by the REAL
      // cart — item prices are re-read from the authored NGN priceSet (never a
      // client-supplied amount); a line whose product no longer resolves is
      // simply skipped (mirrors `placeOrder`'s re-pricing). Weight prefers each
      // product's real `weightGrams` (Phase 8) and falls back to the flat
      // per-item estimate for any line whose product hasn't been weighed yet.
      let totalValueMinor = 0
      let totalWeightGrams = WEIGHT_BASE_GRAMS
      let resolvedLineCount = 0
      for (const line of aggregatedLines) {
        const product = productById.get(line.productId)
        if (!product) continue

        const variant = line.variantId ? product.variants.find((v) => v.id === line.variantId) : undefined
        const unitNgnMinor = (variant?.priceSet?.ngn ?? product.priceSet.ngn).amountMinor

        totalValueMinor += unitNgnMinor * line.quantity
        totalWeightGrams += (product.weightGrams ?? WEIGHT_PER_ITEM_GRAMS) * line.quantity
        resolvedLineCount += 1
      }

      // A cart in which NOTHING resolves to a live product is a phantom cart,
      // and it must not reach ShipBubble. Guest carts live in localStorage, so
      // a device that added items before a product was deleted from the admin
      // still sends those IDs (signed-in carts self-clean — CartItem cascades
      // on product delete). Skipping the dead lines used to leave a ₦0
      // package, which ShipBubble rejects with "invalid package items" — so
      // every quote from such a device silently degraded to the flat
      // fallback, differing by DEVICE, which is exactly how it presented.
      //
      // `[]`, not a flat option: `placeOrder` would refuse this cart anyway,
      // so any quote here prices an order that cannot exist. The client
      // already treats an empty option list as "shipping is temporarily
      // unavailable" and keeps the customer on the address step.
      if (resolvedLineCount === 0) {
        console.error('getShippingRates: no cart line resolved to a live product — not quoting a phantom package')
        return []
      }

      const packageItems = [
        {
          name: 'MSE Lux order',
          description: 'Jewelry order',
          unitWeightGrams: totalWeightGrams,
          unitAmountMinor: totalValueMinor,
          quantity: 1,
        },
      ]

      const addressLine = `${address.line1}, ${address.city}, ${address.state}, ${address.country}`

      const { addressCode: receiverAddressCode } = await validateAddress({
        name: address.fullName,
        // `email` comes from `safeInput`, so it's `string | undefined` at
        // the type level even though the real client always sends it — a
        // request that omits it entirely still can't throw here.
        email: email ?? '',
        phone: address.phone,
        address: addressLine,
      })

      // `requestToken` is deliberately unused here — checkout's quotes are our
      // own HMAC-signed tokens (see `shipping-quote.ts`), not ShipBubble's;
      // the request token only matters to a later booking step (`createLabel`).
      const { rates } = await fetchRates({
        senderAddressCode: SHIPBUBBLE_ORIGIN_ADDRESS_CODE,
        receiverAddressCode,
        packageItems,
        packageDimension: NOMINAL_DIMENSION,
        pickupDate: tomorrowIsoDate(),
      })

      if (rates.length === 0) throw new Error('ShipBubble returned no couriers')

      // ShipBubble prices every route in NGN, international included (verified
      // against production: New York and London both quote in naira). So an
      // NGN customer is charged the courier's amount verbatim, and a USD
      // customer gets it converted here — the ONLY place in this function that
      // changes an amount, which is why the conversion lives on this one line
      // rather than being threaded through `toOption`.
      //
      // The FX call sits inside the try on purpose: `getUsdNgnRate` never
      // throws (it degrades to a committed backstop), but if that contract
      // were ever broken, landing in the catch yields a flat USD rate rather
      // than an unhandled rejection.
      // `chargeCurrency` is untrusted and may be absent entirely at this
      // boundary. Anything that isn't USD is quoted in NGN — the same default
      // `flatFallbackFor` and `guardFallbackOption` already apply, so a
      // malformed request cannot get a different currency depending on which
      // path happened to serve it.
      const quoteCurrency: 'NGN' | 'USD' = chargeCurrency === 'USD' ? 'USD' : 'NGN'
      const fx = quoteCurrency === 'USD' ? await getUsdNgnRate() : null
      if (fx?.source === 'backstop') {
        // Worth knowing about: the store is charging on a hand-maintained
        // snapshot rather than today's rate.
        console.warn('getShippingRates: USD shipping converted on the backstop FX rate, not a live one')
      }

      // Every option's currency equals `chargeCurrency` — the invariant
      // `placeOrder`'s own currency guard depends on.
      return rates.map((rate) =>
        toOption(
          `${rate.courierId}:${rate.serviceCode}`,
          rate.label,
          fx ? usdMinorFromNgnMinor(rate.amountMinor, fx.rate) : rate.amountMinor,
          quoteCurrency,
          hash,
          salt,
          stamp,
          rate.deliveryEta,
        ),
      )
    } catch (error) {
      // Never block checkout on a ShipBubble outage / bad config / unvalidatable
      // address / empty courier list — fall back to a flat rate.
      //
      // WHICH flat rate depends on the destination, and it did not used to.
      // This line hardcoded `FLAT_FALLBACK_NGN` back when the branch was only
      // reachable for a Nigerian address, so "NGN charge" and "domestic" were
      // the same thing here. They no longer are: an outage on an
      // international NGN order would otherwise quote the ₦2,500 domestic
      // rate for a parcel the live API prices near ₦78,000, and the shortfall
      // would land on the store silently, on its biggest orders, only when
      // ShipBubble was already having a bad day.
      console.error('getShippingRates: ShipBubble path failed, falling back to a flat rate', error)
      const fallback = flatFallbackFor(address, chargeCurrency)
      return [toOption('fallback', fallback.label, fallback.amountMinor, fallback.currency, hash, salt, stamp, fallback.deliveryEta)]
    }
  } catch (error) {
    // Top-level safety net: this function must NEVER throw — both its callers
    // are public Server Actions (the checkout page's `getShippingRates` and
    // the gift page's `getGiftShippingRates`), and a throw here would break
    // checkout outright. This catches anything not already handled above
    // (e.g. a bug in a step that runs before/outside the inner ShipBubble
    // try, or an unexpected throw during address validation itself) and still
    // returns one safe, verifiable fallback option.
    console.error('getShippingRates: unexpected failure, falling back to a flat rate', error)

    // `guardFallbackOption` itself signs a quote (`toOption` -> `signQuote`
    // -> `requireSecret()`), which throws when `SHIPBUBBLE_QUOTE_SECRET`
    // isn't set — and since this IS the last-resort handler, that throw
    // would have nothing left to catch it, escaping as an unhandled
    // rejection despite this function's "never throws" contract (the exact
    // 500 QA reported). Detect the unsignable state directly and return an
    // empty option array instead of attempting to sign one; the checkout
    // client treats `[]` as "shipping is temporarily unavailable" and stays
    // on the address step rather than advancing with nothing selectable.
    if (!hasQuoteSecret()) {
      console.error('getShippingRates: SHIPBUBBLE_QUOTE_SECRET is not set — cannot sign a fallback quote, returning no options')
      return []
    }

    // This IS the last-resort handler — there is nothing left to catch a
    // second throw from `guardFallbackOption` itself (e.g. a wrong-TYPED
    // address field reaching `safeAddressHash`, or any other unforeseen
    // failure inside the fallback-building path), so it must be structurally
    // incapable of escaping this function. Same "degrade to []" contract as
    // the missing-secret branch above, for the same reason.
    try {
      return [guardFallbackOption(safeInput.address, safeInput.chargeCurrency, stamp)]
    } catch (fallbackError) {
      console.error('getShippingRates: could not build a last-resort fallback option', fallbackError)
      return []
    }
  }
}
