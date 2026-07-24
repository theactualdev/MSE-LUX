'use server'

import { db } from '@/lib/db'
import { getCurrentUserId } from '@/features/auth/claims'
import { resolveProductsByIds } from '@/features/catalog/server/resolve-products'
import { buildCartLines } from '@/features/cart/lib/lines'
import type { CartItem } from '@/features/cart/store'
import { shippingMethods, shippingAmountFor, TAX_RATE } from '@/features/cart/lib/shipping'
import { contactSchema, addressSchema } from '@/features/checkout/schema'
import { mapOrderRow } from '@/features/checkout/lib/order-view'
import type { PlaceOrderInput, PlaceOrderResult, GuestOrderLine } from '@/features/checkout/types'

/**
 * Order placement: re-prices server-side, decrements inventory, and clears
 * the signed-in user's cart, inside a `db.$transaction` per attempt (see
 * `generateOrderNumber`'s doc comment for why "per attempt", not "one for
 * the whole call").
 *
 * WHY `'use server'` RATHER THAN `import 'server-only'`: same reasoning as
 * `cart/data.ts` — the two directives can't coexist, so this Server Actions
 * module is directly callable from the client checkout flow with no separate
 * `actions.ts` wrapper. That means **`placeOrder` is a public HTTP
 * endpoint**, reachable by anyone who can reach this app. Its `PlaceOrderInput`
 * carries no price of any kind, which is deliberate: every `unitPriceMinor`
 * written below comes from `buildCartLines` reading the authored catalog
 * (via `resolveProductsByIds`), never from the caller — so there is no price
 * field for a tampered client to smuggle in the first place.
 *
 * SECURITY — same authorization model as `cart/data.ts`: Prisma connects
 * through the pooler as a privileged role and bypasses RLS entirely.
 * `userId` comes only from `getCurrentUserId()` (verified JWT), never from
 * `input`. A signed-in caller's line set is read from THEIR persisted server
 * cart (`cart.profileId = userId`) — `guestLines` is only honoured when
 * `userId` is null, so a signed-in caller can't use `guestLines` to check out
 * a fabricated basket that was never actually in their cart.
 */

const INVALID_INPUT: PlaceOrderResult = { error: 'Please check your details and try again.' }
const EMPTY_CART: PlaceOrderResult = { error: 'Your cart is empty.' }
const OUT_OF_STOCK: PlaceOrderResult = { error: 'These items are no longer in stock.' }
const GENERIC_ERROR: PlaceOrderResult = { error: 'Something went wrong. Please try again.' }

/** Prisma's unique-constraint violation. Matched structurally so this module needn't import the error class. */
function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002'
}

/** Prisma's "record to update/delete not found" error. Matched structurally for the same reason. */
function isRecordNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2025'
}

/** How many times to retry order placement on an `orderNumber` collision before giving up. Collisions on a random 6-digit space are rare; this only guards the tail. */
const MAX_ORDER_NUMBER_ATTEMPTS = 5

/**
 * `MSE-` + a random 6-digit number (`000000`-`999999`).
 *
 * A collision against the `orderNumber` unique constraint is retried with a
 * FRESH number in a FRESH `db.$transaction` — never inside the same
 * transaction the failed `create` ran in. Postgres aborts the entire
 * transaction on any failed statement: every later statement on that same
 * connection then fails with `25P02` ("current transaction is aborted"), not
 * the original `P2002` — so a retry-inside-the-transaction would never see
 * the error code it's looking for and would crash on the very collision it
 * exists to handle. `placeOrder` therefore wraps the WHOLE `db.$transaction`
 * call in the retry loop, not just this one `create`.
 */
function generateOrderNumber(): string {
  const digits = Math.floor(Math.random() * 1_000_000)
    .toString()
    .padStart(6, '0')
  return `MSE-${digits}`
}

/** `line2`/`postalCode` collapse empty strings to `null` for the DB — the schema fields are optional strings, not "" placeholders. */
function toNullable(value: string | undefined): string | null {
  return value && value.length > 0 ? value : null
}

/**
 * The raw (unclamped, unpriced) line tuples to price and order: the signed-in
 * user's persisted server cart, or the guest's client-supplied lines when
 * there is no session. Never mixes the two — a signed-in caller's
 * `guestLines` are ignored entirely, so checkout always reflects what is
 * actually sitting in their cart.
 */
async function resolveRawLines(userId: string | null, guestLines: GuestOrderLine[] | undefined): Promise<GuestOrderLine[]> {
  if (!userId) return guestLines ?? []

  const rows = await db.cartItem.findMany({
    where: { cart: { profileId: userId } },
    select: { productId: true, variantId: true, quantity: true },
  })

  return rows.map((row) => ({ productId: row.productId, variantId: row.variantId ?? undefined, quantity: row.quantity }))
}

/**
 * Collapses duplicate `(productId, variantId)` tuples into one, summing their
 * quantities. Without this, a guest payload with two tuples for the same
 * line (e.g. `[{p, qty:99}, {p, qty:99}]` against 5 in stock) would clamp
 * EACH tuple to the inventory independently — two `OrderLine`s and two
 * `{decrement: 5}` calls against 5 in stock, oversold 2x in a single
 * request. Aggregating first means every product/variant is clamped exactly
 * once. A no-op for the signed-in server cart, whose `(cartId, productId,
 * variantId)` compound-unique index already guarantees one row per line —
 * this runs uniformly on both paths anyway rather than trusting that
 * invariant here too.
 */
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

export async function placeOrder(input: PlaceOrderInput): Promise<PlaceOrderResult> {
  const parsedContact = contactSchema.safeParse(input.contact)
  const parsedAddress = addressSchema.safeParse(input.address)
  if (!parsedContact.success || !parsedAddress.success) return INVALID_INPUT

  // `chargeCurrency`'s `'NGN' | 'USD'` type is compile-time only — this is a
  // public Server Action, so a caller can send any string at runtime. An
  // unvalidated value would reach `resolveDisplayPrice` (via `buildCartLines`)
  // and throw OUTSIDE the try/catch below, violating this module's "never
  // throws out" contract.
  if (input.chargeCurrency !== 'NGN' && input.chargeCurrency !== 'USD') return INVALID_INPUT

  const method = shippingMethods.find((m) => m.id === input.shippingMethodId)
  if (!method) return INVALID_INPUT

  const userId = await getCurrentUserId()
  const rawLines = await resolveRawLines(userId, input.guestLines)
  if (rawLines.length === 0) return EMPTY_CART

  const aggregatedLines = aggregateRawLines(rawLines)

  const productIds = Array.from(new Set(aggregatedLines.map((line) => line.productId)))
  const products = await resolveProductsByIds(productIds)
  const productById = new Map(products.map((p) => [p.id, p]))

  // Re-price and clamp every line against the authored catalog. A line whose
  // product no longer resolves, or whose resolved quantity clamps to 0, is
  // dropped rather than ordered — never trust the client's tuple as-is.
  const clampedItems: CartItem[] = []
  for (const raw of aggregatedLines) {
    const product = productById.get(raw.productId)
    if (!product) continue

    const variant = raw.variantId ? product.variants.find((v) => v.id === raw.variantId) : undefined
    const inventory = variant?.inventory ?? product.inventory
    const clampedQty = Math.min(raw.quantity, inventory)
    if (clampedQty <= 0) continue

    clampedItems.push({ productId: raw.productId, variantId: raw.variantId, quantity: clampedQty })
  }

  if (clampedItems.length === 0) return OUT_OF_STOCK

  // The same builder the cart UI uses, so the order total matches what the
  // customer was shown — priced off the authored catalog, in the charge
  // currency, never off a client-supplied amount.
  const lines = buildCartLines(clampedItems, products, input.chargeCurrency)

  const subtotalMinor = lines.reduce((sum, line) => sum + line.lineTotal.amountMinor, 0)
  const shippingMinor = shippingAmountFor(method, input.chargeCurrency).amountMinor
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
    profileId: userId ?? null,
    email: parsedContact.data.email,
    status: 'PENDING' as const,
    shipFullName: parsedAddress.data.fullName,
    shipPhone: parsedAddress.data.phone,
    shipLine1: parsedAddress.data.line1,
    shipLine2: toNullable(parsedAddress.data.line2),
    shipCity: parsedAddress.data.city,
    shipState: parsedAddress.data.state,
    shipCountry: parsedAddress.data.country,
    shipPostalCode: toNullable(parsedAddress.data.postalCode),
    shippingLabel: method.label,
    currency: input.chargeCurrency,
    subtotalMinor,
    shippingMinor,
    taxMinor,
    totalMinor,
  }

  // Each attempt is its OWN `db.$transaction` call (own connection/transaction) —
  // see `generateOrderNumber`'s doc comment for why a collision can't be retried
  // inside the transaction that hit it.
  for (let attempt = 0; attempt < MAX_ORDER_NUMBER_ATTEMPTS; attempt++) {
    const orderNumber = generateOrderNumber()

    try {
      const order = await db.$transaction(async (tx) => {
        const created = await tx.order.create({
          data: { ...orderData, orderNumber, lines: { create: orderLineInputs } },
          include: { lines: true },
        })

        // Best-effort atomic decrement per line — a concurrent oversell is
        // Phase 8's concern (see the plan); this deliberately does not
        // guard-read inventory first.
        for (const line of lines) {
          if (line.variant) {
            await tx.productVariant.update({
              where: { id: line.variant.id },
              data: { inventory: { decrement: line.quantity } },
            })
          } else {
            await tx.product.update({
              where: { id: line.product.id },
              data: { inventory: { decrement: line.quantity } },
            })
          }
        }

        if (userId) {
          await tx.cartItem.deleteMany({ where: { cart: { profileId: userId } } })
        }

        return created
      })

      return { ok: true, order: mapOrderRow(order) }
    } catch (error) {
      if (isUniqueViolation(error)) continue // fresh orderNumber, fresh transaction, next attempt
      if (isRecordNotFound(error)) return GENERIC_ERROR
      throw error // matches cart/data.ts: only a truly-unexpected error propagates
    }
  }

  return GENERIC_ERROR // exhausted every orderNumber attempt
}
