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
 * the signed-in user's cart, all inside one `db.$transaction`.
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

/** How many times to retry order creation on an `orderNumber` collision before giving up. Collisions on a random 6-digit space are rare; this only guards the tail. */
const MAX_ORDER_NUMBER_ATTEMPTS = 5

/** `MSE-` + a random 6-digit number (`000000`-`999999`). Retried on a `P2002` collision against the `orderNumber` unique constraint. */
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

export async function placeOrder(input: PlaceOrderInput): Promise<PlaceOrderResult> {
  const parsedContact = contactSchema.safeParse(input.contact)
  const parsedAddress = addressSchema.safeParse(input.address)
  if (!parsedContact.success || !parsedAddress.success) return INVALID_INPUT

  const method = shippingMethods.find((m) => m.id === input.shippingMethodId)
  if (!method) return INVALID_INPUT

  const userId = await getCurrentUserId()
  const rawLines = await resolveRawLines(userId, input.guestLines)
  if (rawLines.length === 0) return EMPTY_CART

  const productIds = Array.from(new Set(rawLines.map((line) => line.productId)))
  const products = await resolveProductsByIds(productIds)
  const productById = new Map(products.map((p) => [p.id, p]))

  // Re-price and clamp every line against the authored catalog. A line whose
  // product no longer resolves, or whose resolved quantity clamps to 0, is
  // dropped rather than ordered — never trust the client's tuple as-is.
  const clampedItems: CartItem[] = []
  for (const raw of rawLines) {
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

  try {
    const order = await db.$transaction(async (tx) => {
      // Nested closure (not a top-level helper) so `tx` — the interactive-transaction
      // client — is captured without having to name its type. Retries on a `P2002`
      // `orderNumber` collision by catching it here, inside the transaction callback,
      // rather than letting it propagate and abort the whole transaction.
      async function createOrderWithUniqueNumber() {
        for (let attempt = 0; attempt < MAX_ORDER_NUMBER_ATTEMPTS; attempt++) {
          try {
            return await tx.order.create({
              data: { ...orderData, orderNumber: generateOrderNumber(), lines: { create: orderLineInputs } },
              include: { lines: true },
            })
          } catch (error) {
            const isLastAttempt = attempt === MAX_ORDER_NUMBER_ATTEMPTS - 1
            if (!isUniqueViolation(error) || isLastAttempt) throw error
          }
        }
        // Unreachable — the loop above always returns or throws — but keeps this an
        // expression-typed function for TypeScript's control-flow analysis.
        throw new Error('Could not generate a unique order number.')
      }

      const created = await createOrderWithUniqueNumber()

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
    if (isUniqueViolation(error) || isRecordNotFound(error)) return GENERIC_ERROR
    throw error
  }
}
