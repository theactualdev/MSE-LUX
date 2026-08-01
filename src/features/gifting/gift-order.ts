import 'server-only'

import { cookies } from 'next/headers'
import { db } from '@/lib/db'
import { resolveProductsByIds } from '@/features/catalog/server/resolve-products'
import { buildCartLines } from '@/features/cart/lib/lines'
import type { CartItem } from '@/features/cart/store'
import { TAX_RATE } from '@/features/cart/lib/shipping'
import { generateOrderNumber, MAX_ORDER_NUMBER_ATTEMPTS } from '@/features/checkout/lib/order-number'
import type { ResolvedShare } from '@/features/gifting/share'

/**
 * The gift-order engine: the ONE place a gift purchase becomes an `Order`
 * row. Structurally a sibling of `placeOrder` (`checkout/data.ts`) — same
 * re-pricing off the authored catalog, same `TAX_RATE`, same verified-quote
 * shipping amount, same per-attempt-transaction `orderNumber` retry loop —
 * with four deliberate differences, each of which is a product rule:
 *
 * 1. THE DESTINATION IS NOT AN ARGUMENT. There is no `address` parameter on
 *    this function or on either Server Action that calls it
 *    (`checkout-actions.ts`). The ship-to fields are read from
 *    `share.address`, which `resolveShare` read from the OWNER's own saved
 *    address row. A buyer therefore cannot influence where a gift is sent —
 *    not by tampering, because there is no field to tamper with.
 *
 * 2. `profileId` IS ALWAYS NULL. The order belongs to the buyer's session,
 *    never to the wishlist owner: an order stamped with the owner's profile
 *    would show up in their account and spoil the surprise this whole
 *    feature exists to protect. That also means the account-scoped
 *    ownership check `payments.ts` uses can't apply, so — exactly like a
 *    guest order — the `mse_guest_order` cookie is set as the session-bound
 *    proof that this caller is the one who placed it (see the call site).
 *
 * 3. EVERY LINE IS QUANTITY 1. A wishlist has no quantity concept, so the
 *    buyer picks WHICH items to buy, not how many of each. A repeated
 *    selection collapses to one line rather than adding up.
 *
 * 4. ONLY WHAT IS ON THE LIST. Selections are filtered against
 *    `share.productIds` before anything else, so a buyer cannot use a gift
 *    checkout to order an arbitrary product to someone else's address.
 *
 * `server-only`, not `'use server'`: this takes a `ResolvedShare` — which
 * carries the recipient's FULL address — so it must never be reachable as an
 * HTTP endpoint or land in a client bundle. The public surface is
 * `checkout-actions.ts`, which resolves the share itself.
 *
 * NEVER THROWS OUT for an expected failure: every refusal is a typed
 * `{ ok: false, error }` with fixed, non-leaking copy. Only a truly
 * unexpected DB error propagates (mirrors `placeOrder`).
 */

export interface GiftSelection {
  productId: string
  /** `null` for a product with no variant chosen — the gift page's default. */
  variantId: string | null
}

export interface CreateGiftOrderInput {
  /** Resolved SERVER-SIDE from the share token by the caller. Never built from buyer input. */
  share: ResolvedShare
  selections: GiftSelection[]
  /** The BUYER's email — they get the receipt and the payment flow, not the recipient. */
  email: string
  chargeCurrency: 'NGN' | 'USD'
  /**
   * Already verified by the caller against the OWNER's address
   * (`verifyQuote`), so the amount here is server-signed, never a number the
   * buyer sent.
   */
  quote: { label: string; amountMinor: number; currency: 'NGN' | 'USD' }
}

export type CreateGiftOrderResult = { ok: true; orderNumber: string } | { ok: false; error: string }

const NOTHING_AVAILABLE: CreateGiftOrderResult = {
  ok: false,
  error: 'Those items are no longer available. Please pick again.',
}
const GENERIC_ERROR: CreateGiftOrderResult = { ok: false, error: 'Something went wrong. Please try again.' }

/** Prisma's unique-constraint violation. Matched structurally so this module needn't import the error class (the same idiom as `checkout/data.ts`, `cart/data.ts`). */
function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002'
}

/** Prisma's "record to update/delete not found" error. Matched structurally for the same reason. */
function isRecordNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2025'
}

/** Empty strings collapse to `null` for the DB — the ship columns are nullable, not `''` placeholders. */
function toNullable(value: string | null | undefined): string | null {
  return value && value.length > 0 ? value : null
}

/**
 * Keeps only selections whose product is actually ON the shared wishlist, and
 * collapses duplicates — `(productId, variantId)` appearing twice is ONE gift,
 * not two, because there is no quantity to add up (see rule 3 above).
 */
function allowedSelections(share: ResolvedShare, selections: GiftSelection[]): GiftSelection[] {
  const onList = new Set(share.productIds)
  const byKey = new Map<string, GiftSelection>()

  for (const selection of selections) {
    if (!onList.has(selection.productId)) continue
    byKey.set(`${selection.productId}::${selection.variantId ?? ''}`, selection)
  }

  return Array.from(byKey.values())
}

export async function createGiftOrder(input: CreateGiftOrderInput): Promise<CreateGiftOrderResult> {
  const { share, email, chargeCurrency, quote } = input

  const selections = allowedSelections(share, input.selections)
  if (selections.length === 0) return NOTHING_AVAILABLE

  const productIds = Array.from(new Set(selections.map((selection) => selection.productId)))
  const products = await resolveProductsByIds(productIds)
  const productById = new Map(products.map((p) => [p.id, p]))

  // Re-check every selection against the authored catalog. A product that no
  // longer resolves (deleted / no longer ACTIVE), or that has nothing in
  // stock, is DROPPED rather than ordered — same posture as `placeOrder`'s
  // clamp loop, but there is nothing to clamp here: the quantity is always 1,
  // so a line is either orderable or it isn't.
  const items: CartItem[] = []
  for (const selection of selections) {
    const product = productById.get(selection.productId)
    if (!product) continue

    const variant = selection.variantId ? product.variants.find((v) => v.id === selection.variantId) : undefined
    const inventory = variant?.inventory ?? product.inventory
    if (inventory <= 0) continue

    // `CartItem.variantId` is `string | undefined`; a gift selection carries
    // `null` for "no variant". Same meaning, different spelling.
    items.push({ productId: selection.productId, variantId: selection.variantId ?? undefined, quantity: 1 })
  }

  if (items.length === 0) return NOTHING_AVAILABLE

  // The same builder the cart and `placeOrder` use, so a gift total is
  // computed exactly like any other order — off the authored catalog in the
  // charge currency, never off a buyer-supplied amount.
  const lines = buildCartLines(items, products, chargeCurrency)
  if (lines.length === 0) return NOTHING_AVAILABLE

  const subtotalMinor = lines.reduce((sum, line) => sum + line.lineTotal.amountMinor, 0)
  const shippingMinor = quote.amountMinor
  const taxMinor = Math.round(subtotalMinor * TAX_RATE)
  const totalMinor = subtotalMinor + shippingMinor + taxMinor

  const orderLineInputs = lines.map((line) => ({
    productName: line.product.name,
    variantLabel: line.variant ? line.variant.options.map((o) => o.value).join(' / ') : null,
    image: line.image.src,
    imageAlt: line.image.alt,
    quantity: line.quantity,
    unitPriceMinor: line.unitPrice.amountMinor,
    lineTotalMinor: line.lineTotal.amountMinor,
    productId: line.product.id,
    variantId: line.variant?.id ?? null,
  }))

  const orderData = {
    // Rule 2 — never the owner's profile, and never the buyer's either: the
    // buyer's claim on this order is the session cookie set below.
    profileId: null,
    email,
    status: 'PENDING' as const,
    // Rule 1 — the destination comes from the resolved share, which came from
    // the OWNER's saved address. Nothing on this path came from the buyer.
    shipFullName: share.address.fullName,
    shipPhone: share.address.phone,
    shipLine1: share.address.line1,
    shipLine2: toNullable(share.address.line2),
    shipCity: share.address.city,
    shipState: share.address.state,
    shipCountry: share.address.country,
    shipPostalCode: toNullable(share.address.postalCode),
    shippingLabel: quote.label,
    currency: chargeCurrency,
    subtotalMinor,
    shippingMinor,
    taxMinor,
    totalMinor,
    isGift: true,
    giftRecipientName: share.recipientFirstName,
  }

  // Each attempt is its OWN `db.$transaction` call — see `generateOrderNumber`'s
  // doc comment (`checkout/lib/order-number.ts`) for why a collision can't be
  // retried inside the transaction that hit it.
  for (let attempt = 0; attempt < MAX_ORDER_NUMBER_ATTEMPTS; attempt++) {
    const orderNumber = generateOrderNumber()

    try {
      const created = await db.$transaction(async (tx) =>
        tx.order.create({
          data: { ...orderData, orderNumber, lines: { create: orderLineInputs } },
          include: { lines: true },
        }),
      )

      // A gift order has NO `profileId` by design (rule 2), so the payment
      // actions cannot scope it by user — for them it is indistinguishable
      // from a guest order, and `loadOwnedOrder` (`checkout/payments.ts`)
      // requires this httpOnly cookie as the session-bound proof of
      // ownership. Set unconditionally, signed-in buyer or not: without it
      // the buyer could not pay for the order they just created, and with it
      // an anonymous caller still cannot enumerate order numbers and take
      // over someone else's.
      const cookieStore = await cookies()
      cookieStore.set('mse_guest_order', created.orderNumber, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60, // 1h — long enough to complete payment
      })

      return { ok: true, orderNumber: created.orderNumber }
    } catch (error) {
      if (isUniqueViolation(error)) continue // fresh orderNumber, fresh transaction, next attempt
      if (isRecordNotFound(error)) return GENERIC_ERROR
      throw error // matches `placeOrder`: only a truly-unexpected error propagates
    }
  }

  return GENERIC_ERROR // exhausted every orderNumber attempt
}
