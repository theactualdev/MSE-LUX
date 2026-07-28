'use server'

import { db } from '@/lib/db'
import { getCurrentUserId } from '@/features/auth/claims'
import { resolveProductsByIds } from '@/features/catalog/server/resolve-products'
import { validateAddress, fetchRates } from '@/features/checkout/lib/shipbubble'
import { signQuote, addressHash } from '@/features/checkout/lib/shipping-quote'
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
 * Every option's currency equals `input.chargeCurrency`, never the address's
 * country, so `placeOrder`'s currency guard always passes. This mirrors
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

/** Signs a `{ label, amountMinor, currency, addressHash, exp }` payload into a full `ShippingOption`. */
function toOption(
  id: string,
  label: string,
  amountMinor: number,
  currency: 'NGN' | 'USD',
  hash: string,
  deliveryEta?: string,
): ShippingOption {
  const exp = Date.now() + QUOTE_TTL_MS
  const token = signQuote({ label, amountMinor, currency, addressHash: hash, exp })
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
 * `null`/`undefined`/a non-object at the boundary. Coerces anything that
 * isn't a real object to `{}` first so a guard-path fallback option can
 * always be built (and later re-verified with `verifyQuote`) without risking
 * a second throw while we're already handling the first one.
 */
function safeAddressHash(address: unknown): string {
  const candidate = address && typeof address === 'object' ? (address as Address) : ({} as Address)
  return addressHash(candidate)
}

/**
 * The single flat rate returned whenever the request can't even be processed
 * (malformed address, or any other unexpected throw) — in `chargeCurrency`,
 * defaulting to NGN if `chargeCurrency` is itself somehow invalid at this
 * boundary. A genuinely malformed address will be rejected again by
 * `placeOrder`'s own `addressSchema.safeParse` before anything is charged.
 */
function guardFallbackOption(address: unknown, chargeCurrency: unknown): ShippingOption {
  const hash = safeAddressHash(address)
  const fallback = chargeCurrency === 'USD' ? FLAT_FALLBACK_USD : FLAT_FALLBACK_NGN
  return toOption('fallback', fallback.label, fallback.amountMinor, fallback.currency, hash, fallback.deliveryEta)
}

export async function getShippingRates(input: {
  address: Address
  /** ShipBubble requires a contact email for address validation; the checkout flow already has it by the shipping step. */
  email: string
  /**
   * The customer's browsing-region charge currency (Phase 5d/6) — independent
   * of the shipping address. Every returned option's `currency` (and its
   * token's payload currency) equals this, never the address's country, so
   * `placeOrder`'s `quote.currency !== input.chargeCurrency` guard always
   * passes for a legit flow: live ShipBubble ₦ rates are only used when
   * charging NGN to a Nigerian address; every other combination gets a flat
   * rate already denominated in `chargeCurrency`.
   */
  chargeCurrency: 'NGN' | 'USD'
  guestLines?: GuestOrderLine[]
}): Promise<ShippingOption[]> {
  try {
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
    if (!(await checkRateLimit('checkout'))) {
      console.error('getShippingRates: rate limited, falling back to a flat rate')

      // Don't let a limit hit ship an international order at the domestic
      // flat rate: if the address parses and this is an NGN charge to a
      // NON-Nigerian destination, return the same signed
      // FLAT_INTERNATIONAL_NGN option the un-limited international branch
      // below would build — never the cheaper, mislabeled
      // FLAT_FALLBACK_NGN that `guardFallbackOption` would otherwise pick on
      // currency alone.
      const parsedForLimit = addressSchema.safeParse(input.address)
      if (parsedForLimit.success && input.chargeCurrency === 'NGN' && !isNigeria(parsedForLimit.data.country)) {
        const limitHash = addressHash(parsedForLimit.data)
        return [
          toOption(
            'international',
            FLAT_INTERNATIONAL_NGN.label,
            FLAT_INTERNATIONAL_NGN.amountMinor,
            FLAT_INTERNATIONAL_NGN.currency,
            limitHash,
            FLAT_INTERNATIONAL_NGN.deliveryEta,
          ),
        ]
      }

      return [guardFallbackOption(input.address, input.chargeCurrency)]
    }

    // `input.address` is untrusted at this boundary (a public Server Action —
    // no runtime arg validation happens for us). A malformed/missing address
    // must not throw straight out of the function; it gets one safe flat
    // option instead, exactly like any other unrecoverable failure below.
    const parsedAddress = addressSchema.safeParse(input.address)
    if (!parsedAddress.success) return [guardFallbackOption(input.address, input.chargeCurrency)]

    const address = parsedAddress.data
    const { email, guestLines, chargeCurrency } = input
    const hash = addressHash(address)
    const nigeria = isNigeria(address.country)

    // ShipBubble only ever quotes in NGN, so live rates can only be offered
    // when the customer is charged in NGN AND the address is Nigerian.
    // Every other combination (USD charge to anywhere, or NGN charge to a
    // non-NG address) gets a single flat rate already in `chargeCurrency` —
    // no ShipBubble call, no FX.
    if (chargeCurrency !== 'NGN' || !nigeria) {
      const flat = chargeCurrency === 'USD' ? FLAT_INTERNATIONAL_USD : FLAT_INTERNATIONAL_NGN
      return [toOption('international', flat.label, flat.amountMinor, flat.currency, hash, flat.deliveryEta)]
    }

    try {
      // A blank origin code means the store's ShipBubble pickup address hasn't
      // been configured yet — fail fast into the fallback rather than calling
      // ShipBubble with an invalid sender code.
      if (!SHIPBUBBLE_ORIGIN_ADDRESS_CODE) throw new Error('SHIPBUBBLE_ORIGIN_ADDRESS_CODE is not configured')

      const userId = await getCurrentUserId()
      const rawLines = await resolveRawLines(userId, guestLines)
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
          unit_weight: totalWeightGrams,
          unit_amount: totalValueMinor,
          quantity: 1,
        },
      ]

      const addressLine = `${address.line1}, ${address.city}, ${address.state}, ${address.country}`

      const { addressCode: receiverAddressCode } = await validateAddress({
        name: address.fullName,
        email,
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
      return rates.map((rate) => toOption(`${rate.courierId}:${rate.serviceCode}`, rate.label, rate.amountMinor, 'NGN', hash, rate.deliveryEta))
    } catch (error) {
      // Never block checkout on a ShipBubble outage / bad config / unvalidatable
      // address / empty courier list — fall back to the flat NGN rate (this
      // branch is only reached when charging NGN to a Nigerian address).
      console.error('getShippingRates: ShipBubble path failed, falling back to a flat rate', error)
      return [toOption('fallback', FLAT_FALLBACK_NGN.label, FLAT_FALLBACK_NGN.amountMinor, FLAT_FALLBACK_NGN.currency, hash, FLAT_FALLBACK_NGN.deliveryEta)]
    }
  } catch (error) {
    // Top-level safety net: `getShippingRates` must NEVER throw — it's a
    // public Server Action feeding the checkout page, and a throw here would
    // break checkout outright. This catches anything not already handled
    // above (e.g. a bug in a step that runs before/outside the inner
    // ShipBubble try, or an unexpected throw during address validation
    // itself) and still returns one safe, verifiable fallback option.
    console.error('getShippingRates: unexpected failure, falling back to a flat rate', error)
    return [guardFallbackOption(input.address, input.chargeCurrency)]
  }
}
