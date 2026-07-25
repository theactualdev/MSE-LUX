'use server'

import { db } from '@/lib/db'
import { getCurrentUserId } from '@/features/auth/claims'
import { resolveProductsByIds } from '@/features/catalog/server/resolve-products'
import { validateAddress, fetchRates } from '@/features/checkout/lib/shipbubble'
import { signQuote, addressHash } from '@/features/checkout/lib/shipping-quote'
import {
  SHIPBUBBLE_ORIGIN_ADDRESS_CODE,
  FLAT_INTERNATIONAL,
  FLAT_FALLBACK_NGN,
  FLAT_FALLBACK_USD,
  WEIGHT_BASE_GRAMS,
  WEIGHT_PER_ITEM_GRAMS,
  NOMINAL_DIMENSION,
} from '@/features/checkout/lib/shipping-config'
import type { Address } from '@/features/checkout/schema'
import type { GuestOrderLine } from '@/features/checkout/types'
import type { ShippingOption } from '@/features/checkout/shipping-types'

/**
 * `getShippingRates`: the client calls this right after the address step to
 * get selectable, server-signed shipping options — live ShipBubble courier
 * rates for a Nigerian destination, a flat international rate elsewhere, and
 * a flat fallback whenever the ShipBubble path can't complete. This mirrors
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

export async function getShippingRates(input: {
  address: Address
  /** ShipBubble requires a contact email for address validation; the checkout flow already has it by the shipping step. */
  email: string
  guestLines?: GuestOrderLine[]
}): Promise<ShippingOption[]> {
  const { address, email, guestLines } = input
  const hash = addressHash(address)
  const nigeria = isNigeria(address.country)

  if (!nigeria) {
    return [
      toOption(
        'international',
        FLAT_INTERNATIONAL.label,
        FLAT_INTERNATIONAL.amountMinor,
        FLAT_INTERNATIONAL.currency,
        hash,
        FLAT_INTERNATIONAL.deliveryEta,
      ),
    ]
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

    // Declared/insured value and the flat weight estimate, both driven by the
    // REAL cart — item prices are re-read from the authored NGN priceSet
    // (never a client-supplied amount); a line whose product no longer
    // resolves is simply skipped (mirrors `placeOrder`'s re-pricing).
    let totalQuantity = 0
    let totalValueMinor = 0
    for (const line of aggregatedLines) {
      const product = productById.get(line.productId)
      if (!product) continue

      const variant = line.variantId ? product.variants.find((v) => v.id === line.variantId) : undefined
      const unitNgnMinor = (variant?.priceSet?.ngn ?? product.priceSet.ngn).amountMinor

      totalQuantity += line.quantity
      totalValueMinor += unitNgnMinor * line.quantity
    }

    const totalWeightGrams = WEIGHT_BASE_GRAMS + WEIGHT_PER_ITEM_GRAMS * totalQuantity

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

    const rates = await fetchRates({
      senderAddressCode: SHIPBUBBLE_ORIGIN_ADDRESS_CODE,
      receiverAddressCode,
      packageItems,
      packageDimension: NOMINAL_DIMENSION,
      pickupDate: tomorrowIsoDate(),
    })

    if (rates.length === 0) throw new Error('ShipBubble returned no couriers')

    return rates.map((rate) => {
      const currency = rate.currency === 'USD' ? 'USD' : 'NGN'
      return toOption(`${rate.courierId}:${rate.serviceCode}`, rate.label, rate.amountMinor, currency, hash, rate.deliveryEta)
    })
  } catch (error) {
    // Never block checkout on a ShipBubble outage / bad config / unvalidatable
    // address / empty courier list — fall back to a single flat rate.
    console.error('getShippingRates: ShipBubble path failed, falling back to a flat rate', error)
    const fallback = nigeria ? FLAT_FALLBACK_NGN : FLAT_FALLBACK_USD
    return [toOption('fallback', fallback.label, fallback.amountMinor, fallback.currency, hash, fallback.deliveryEta)]
  }
}
