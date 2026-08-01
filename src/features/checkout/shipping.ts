'use server'

import { db } from '@/lib/db'
import { getCurrentUserId } from '@/features/auth/claims'
import { resolveProductsByIds } from '@/features/catalog/server/resolve-products'
import { validateAddress, fetchRates } from '@/features/checkout/lib/shipbubble'
import { signQuote, addressHash, newQuoteSalt } from '@/features/checkout/lib/shipping-quote'
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
 * `getShippingRates`: the client calls this right after the address step to
 * get selectable, server-signed shipping options — live ShipBubble courier
 * rates when charging NGN to a Nigerian destination, a flat rate in the
 * charge currency otherwise (live ₦ rates can't be charged in USD without
 * FX), and a flat fallback whenever the ShipBubble path can't complete.
 * Every option's currency equals `input.chargeCurrency` — ALWAYS the
 * client's own format-validated value, never the address's country and,
 * since Phase 9c Task 4, never the server geo signal either (see the
 * currency-resolution comment inside the function body for why) — so
 * `placeOrder`'s currency guard always passes for a legit flow. This mirrors
 * `placeOrder`'s cart-resolution idiom (`data.ts`) exactly, but is read-only:
 * no order, no inventory clamp, no DB write — it only reads the cart to size
 * the ShipBubble package (weight + declared value).
 *
 * WHY `'use server'` RATHER THAN `import 'server-only'`: same reasoning as
 * `data.ts` — this is a Server Action called directly from the client
 * checkout flow, so it's a public HTTP endpoint. It carries no secret beyond
 * each option's opaque signed `token`; the ShipBubble API key and the quote
 * HMAC secret are read only inside the server-only modules this calls
 * (`lib/shipbubble.ts`, `lib/shipping-quote.ts`), never here.
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
 * Signs a `{ label, amountMinor, currency, addressHash, salt, exp, scope }`
 * payload into a full `ShippingOption`. `hash` and `salt` MUST be the exact
 * pair produced together by one `addressHash(address, salt)` call — every
 * call site below mints its salt with `newQuoteSalt()` immediately before
 * hashing, precisely so the salt threaded into the payload here is the same
 * one the hash was computed under (see `shipping-quote.ts`'s docblock for why
 * a mismatched pair would defeat the salt's whole purpose).
 *
 * `scope` records which flow this quote is good for — `'checkout'` or
 * `'gift'` — so it travels with every option `getShippingRates` returns,
 * ordinary or fallback alike. See `ShippingQuotePayload.scope`'s doc comment
 * for the full rationale: without it, a gift buyer's legitimately-held
 * gift-scoped token could be handed to `placeOrder` alongside a guessed
 * address and used as a free online oracle for the recipient's hidden
 * `line1`/`postalCode`.
 */
function toOption(
  id: string,
  label: string,
  amountMinor: number,
  currency: 'NGN' | 'USD',
  hash: string,
  salt: string,
  scope: 'checkout' | 'gift',
  deliveryEta?: string,
): ShippingOption {
  const exp = Date.now() + QUOTE_TTL_MS
  const token = signQuote({ label, amountMinor, currency, addressHash: hash, salt, exp, scope })
  return { id, label, amountMinor, currency, deliveryEta, token }
}

/** `YYYY-MM-DD` for tomorrow — ShipBubble's `pickup_date`, kept a day out so a same-day cutoff never fails the quote. */
function tomorrowIsoDate(): string {
  return new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

/**
 * `addressHash` is safe on a well-formed `Address` (every field is normalized
 * with `?? ''`), but `getShippingRates` is a public Server Action — callers
 * don't runtime-validate their args, so `input.address` can arrive as
 * `null`/`undefined`/a non-object, OR as an object whose individual fields
 * are the WRONG type (e.g. `{ line1: 123 }`) at the boundary. Guarding only
 * the container isn't enough: `addressHash`'s normalize is
 * `(value ?? '').trim().toLowerCase()`, so a present-but-non-string field
 * (`(123).trim()`) still throws. Every field is therefore individually
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
function guardFallbackOption(address: unknown, chargeCurrency: unknown, scope: 'checkout' | 'gift'): ShippingOption {
  const { hash, salt } = safeAddressHash(address)
  const fallback = chargeCurrency === 'USD' ? FLAT_FALLBACK_USD : FLAT_FALLBACK_NGN
  return toOption('fallback', fallback.label, fallback.amountMinor, fallback.currency, hash, salt, scope, fallback.deliveryEta)
}

/**
 * Checked directly against `process.env` (never via `signQuote`'s own
 * `requireSecret()`) so the top-level catch can detect an unsignable state
 * WITHOUT itself throwing — that's the whole point of this check existing.
 */
function hasQuoteSecret(): boolean {
  return !!process.env.SHIPBUBBLE_QUOTE_SECRET
}

export async function getShippingRates(input: {
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
   * legit flow: live ShipBubble ₦ rates are only used when charging NGN to a
   * Nigerian address; every other combination gets a flat rate already
   * denominated in `chargeCurrency`.
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
   * This IS a public Server Action, so a hostile caller can of course send
   * `lines` directly and have a signed-in session's own cart skipped — worth
   * stating plainly, because `guestLines` deliberately does NOT allow that.
   * It grants no capability that wasn't already reachable: a quote token is
   * bound to the ADDRESS, an amount and an expiry — never to a cart or a
   * session — so anyone wanting a cheaper courier quote could already get one
   * by calling this action with a light `guestLines` while signed out and
   * spending the token afterwards. Under-declaring the package therefore
   * costs shipping accuracy, exactly as it already could, and nothing more:
   * every ORDER line is still re-priced from the authored catalog at
   * placement (`placeOrder` / `createGiftOrder`), so no item price, subtotal
   * or total can be moved from here.
   */
  lines?: GuestOrderLine[]
  /**
   * Which flow is asking — `'checkout'` (default) for the ordinary
   * address-entry step, `'gift'` for `getGiftShippingRates`. Stamped onto
   * every returned option's token (`ShippingQuotePayload.scope`) so a token
   * can only ever be spent on the flow that minted it: `placeOrder` requires
   * `'checkout'`, `placeGiftOrder` requires `'gift'`. This exists so a gift
   * token — legitimately bound to a wishlist owner's address the buyer was
   * never shown — has no endpoint left where a caller can supply a guessed
   * address and have it compared against that token, which is what made the
   * token a free online oracle for the recipient's hidden `line1`/
   * `postalCode` before this field existed. Defaults to `'checkout'` because
   * every caller except the gift flow omits it.
   */
  scope?: 'checkout' | 'gift'
}): Promise<ShippingOption[]> {
  // Public Server Action — a caller can POST with no body at all (or any
  // other falsy value), making `input` itself `undefined`/`null` at this
  // boundary despite the compile-time type. Normalized ONCE, before the
  // top-level try, so every reference below — including the top-level
  // catch's own last-resort `guardFallbackOption` call — reads from this
  // safe value instead of risking `input.chargeCurrency` throwing a SECOND
  // time while the catch is already handling the first throw (the exact
  // "double-throw" that used to escape as an unhandled rejection when
  // `input` was nullish).
  const safeInput = (input ?? {}) as Partial<typeof input>

  // Resolved once, up front — outside the top-level try — so it's available
  // both to the normal path below AND to the top-level catch's own
  // last-resort `guardFallbackOption` call (see that call site). Anything
  // other than the literal `'gift'` defaults to `'checkout'`, which also
  // covers a malformed/garbage value at this public boundary.
  const scope: 'checkout' | 'gift' = safeInput.scope === 'gift' ? 'gift' : 'checkout'

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
    // would escape `getShippingRates` entirely on a limited request.
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
      // alone. Mirrors the real branch's own condition
      // (`chargeCurrency !== 'NGN' || !nigeria`) exactly, rather than
      // special-casing NGN, so the two paths can't drift apart the moment
      // `shipping-config.ts`'s flat rates (every one marked "finalize before
      // launch") are tuned to different values.
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
            scope,
            flat.deliveryEta,
          ),
        ]
      }

      return [guardFallbackOption(safeInput.address, chargeCurrency, scope)]
    }

    // `safeInput.address` is untrusted at this boundary (a public Server
    // Action — no runtime arg validation happens for us, and `safeInput`
    // itself only guards against a nullish `input`, not a malformed
    // `address` within it). A malformed/missing address must not throw
    // straight out of the function; it gets one safe flat option instead,
    // exactly like any other unrecoverable failure below.
    const parsedAddress = addressSchema.safeParse(safeInput.address)
    if (!parsedAddress.success) return [guardFallbackOption(safeInput.address, chargeCurrency, scope)]

    const address = parsedAddress.data
    const { email, guestLines, lines } = safeInput
    const salt = newQuoteSalt()
    const hash = addressHash(address, salt)
    const nigeria = isNigeria(address.country)

    // ShipBubble only ever quotes in NGN, so live rates can only be offered
    // when the customer is charged in NGN AND the address is Nigerian.
    // Every other combination (USD charge to anywhere, or NGN charge to a
    // non-NG address) gets a single flat rate already in `chargeCurrency` —
    // no ShipBubble call, no FX.
    if (chargeCurrency !== 'NGN' || !nigeria) {
      const flat = chargeCurrency === 'USD' ? FLAT_INTERNATIONAL_USD : FLAT_INTERNATIONAL_NGN
      return [toOption('international', flat.label, flat.amountMinor, flat.currency, hash, salt, scope, flat.deliveryEta)]
    }

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
      for (const line of aggregatedLines) {
        const product = productById.get(line.productId)
        if (!product) continue

        const variant = line.variantId ? product.variants.find((v) => v.id === line.variantId) : undefined
        const unitNgnMinor = (variant?.priceSet?.ngn ?? product.priceSet.ngn).amountMinor

        totalValueMinor += unitNgnMinor * line.quantity
        totalWeightGrams += (product.weightGrams ?? WEIGHT_PER_ITEM_GRAMS) * line.quantity
      }

      const packageItems = [
        {
          name: 'MSE Lux order',
          description: 'Jewelry order',
          unitWeightGrams: totalWeightGrams,
          unit_amount: totalValueMinor,
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

      // This branch only runs when `chargeCurrency === 'NGN' && nigeria`, so
      // every option is forced to NGN — the branch invariant — regardless of
      // whatever currency ShipBubble's response happens to label the rate
      // with (it's always NGN in practice for a NG receiver).
      return rates.map((rate) => toOption(`${rate.courierId}:${rate.serviceCode}`, rate.label, rate.amountMinor, 'NGN', hash, salt, scope, rate.deliveryEta))
    } catch (error) {
      // Never block checkout on a ShipBubble outage / bad config / unvalidatable
      // address / empty courier list — fall back to the flat NGN rate (this
      // branch is only reached when charging NGN to a Nigerian address).
      console.error('getShippingRates: ShipBubble path failed, falling back to a flat rate', error)
      return [toOption('fallback', FLAT_FALLBACK_NGN.label, FLAT_FALLBACK_NGN.amountMinor, FLAT_FALLBACK_NGN.currency, hash, salt, scope, FLAT_FALLBACK_NGN.deliveryEta)]
    }
  } catch (error) {
    // Top-level safety net: `getShippingRates` must NEVER throw — it's a
    // public Server Action feeding the checkout page, and a throw here would
    // break checkout outright. This catches anything not already handled
    // above (e.g. a bug in a step that runs before/outside the inner
    // ShipBubble try, or an unexpected throw during address validation
    // itself) and still returns one safe, verifiable fallback option.
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
      return [guardFallbackOption(safeInput.address, safeInput.chargeCurrency, scope)]
    } catch (fallbackError) {
      console.error('getShippingRates: could not build a last-resort fallback option', fallbackError)
      return []
    }
  }
}
