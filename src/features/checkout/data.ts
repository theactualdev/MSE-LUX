'use server'

import { cookies } from 'next/headers'
import { db } from '@/lib/db'
import { getCurrentUserId } from '@/features/auth/claims'
import { resolveProductsByIds } from '@/features/catalog/server/resolve-products'
import { buildCartLines } from '@/features/cart/lib/lines'
import type { CartItem } from '@/features/cart/store'
import { TAX_RATE } from '@/features/cart/lib/shipping'
import { verifyQuote } from '@/features/checkout/lib/shipping-quote'
import { contactSchema, addressSchema } from '@/features/checkout/schema'
import type { Address } from '@/features/checkout/schema'
import { mapOrderRow } from '@/features/checkout/lib/order-view'
import { serverChargeCurrency } from '@/features/currency/lib/charge-currency-server'
import { checkRateLimit, RATE_LIMITED_MESSAGE } from '@/lib/rate-limit'
import type { PlaceOrderInput, PlaceOrderResult, GuestOrderLine } from '@/features/checkout/types'
// `account/data.ts` carries `import 'server-only'`, not `'use server'` — it's
// an ordinary server module (not a Server Actions module restricted to async
// function exports), so its constant is importable directly here.
import { MAX_ADDRESSES_PER_PROFILE } from '@/features/account/data'

/**
 * Order placement: re-prices server-side and creates a **PENDING** order —
 * nothing else. Every `orderLineInputs` quantity is already clamped to the
 * authored catalog's inventory (see the clamp loop below), so a PENDING
 * order's totals and lines are correct even though no inventory has been
 * touched yet. Each attempt runs its `tx.order.create` inside its own
 * `db.$transaction` (see `generateOrderNumber`'s doc comment for why "per
 * attempt", not "one for the whole call").
 *
 * Fulfilment — decrementing inventory and clearing the signed-in user's
 * cart — does NOT happen here. It happens exactly once, on verified
 * payment, in `markOrderPaid` (`lib/fulfil-order.ts`), which both the
 * Paystack webhook and `verifyPayment` funnel through. Placing an order
 * therefore never reserves stock or touches the cart; only a paid order
 * does.
 *
 * WHY `'use server'` RATHER THAN `import 'server-only'`: same reasoning as
 * `cart/data.ts` — the two directives can't coexist, so this Server Actions
 * module is directly callable from the client checkout flow with no separate
 * `actions.ts` wrapper. That means **`placeOrder` is a public HTTP
 * endpoint**, reachable by anyone who can reach this app. Its `PlaceOrderInput`
 * carries no raw price of any kind, which is deliberate: every `unitPriceMinor`
 * written below comes from `buildCartLines` reading the authored catalog
 * (via `resolveProductsByIds`), never from the caller. The one input that
 * *does* carry an amount — `shippingToken` — is not trusted as a number: it's
 * an opaque, server-signed quote (`verifyQuote`, `lib/shipping-quote.ts`)
 * bound to `input.address` and to an expiry, so a tampered/expired/wrong-
 * address token is rejected outright rather than read for its face value.
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
const SHIPPING_EXPIRED: PlaceOrderResult = { error: 'Please re-select a shipping option.' }
const RATE_LIMITED: PlaceOrderResult = { error: RATE_LIMITED_MESSAGE }

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
 * Normalizes an address's location fields for duplicate comparison: trim,
 * lowercase, and collapse missing/`null`/`undefined` to `''` before joining —
 * the same normalization idiom `addressHash` uses to bind a shipping quote to
 * a destination (`lib/shipping-quote.ts`), reused here as a plain string key
 * instead of a hash since this comparison never leaves the process.
 */
function normalizeAddressKey(fields: {
  line1: string
  city: string
  state: string
  country: string
  postalCode?: string | null
}): string {
  const normalize = (value: string | null | undefined) => (value ?? '').trim().toLowerCase()
  return [fields.line1, fields.city, fields.state, fields.country, fields.postalCode].map(normalize).join('|')
}

/**
 * Best-effort "save this address to my account", called ONLY after the order
 * transaction above has already committed, and ONLY when `userId &&
 * input.saveAddress === true` (see the call site). This function must NEVER
 * affect what `placeOrder` returns — its own try/catch swallows and logs any
 * failure rather than letting it propagate, and its caller doesn't await it
 * into the result.
 *
 * One `findMany` covers both checks: the cap (`.length` against
 * `MAX_ADDRESSES_PER_PROFILE`) and the duplicate scan (normalized comparison
 * against each existing row). A separate `address.count` before the
 * `findMany` would just be a second round-trip for the same information —
 * the fields needed for duplicate detection already include every row that
 * counting would, so `.length` on that same result is enough for the cap
 * too.
 */
async function saveAddressBestEffort(userId: string, address: Address): Promise<void> {
  try {
    const existing = await db.address.findMany({
      where: { profileId: userId },
      select: { line1: true, city: true, state: true, country: true, postalCode: true },
    })

    if (existing.length >= MAX_ADDRESSES_PER_PROFILE) return

    const incomingKey = normalizeAddressKey(address)
    const isDuplicate = existing.some((row) => normalizeAddressKey(row) === incomingKey)
    if (isDuplicate) return

    await db.address.create({
      data: {
        profileId: userId,
        fullName: address.fullName,
        phone: address.phone,
        line1: address.line1,
        line2: toNullable(address.line2),
        city: address.city,
        state: address.state,
        country: address.country,
        postalCode: toNullable(address.postalCode),
        isDefault: false,
      },
    })
  } catch (error) {
    console.error('[placeOrder] address save-back failed', error)
  }
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
  if (!(await checkRateLimit('checkout'))) return RATE_LIMITED

  const parsedContact = contactSchema.safeParse(input.contact)
  const parsedAddress = addressSchema.safeParse(input.address)
  if (!parsedContact.success || !parsedAddress.success) return INVALID_INPUT

  // `chargeCurrency`'s `'NGN' | 'USD'` type is compile-time only — this is a
  // public Server Action, so a caller can send any string at runtime. An
  // unvalidated value would reach `resolveDisplayPrice` (via `buildCartLines`)
  // and throw OUTSIDE the try/catch below, violating this module's "never
  // throws out" contract.
  if (input.chargeCurrency !== 'NGN' && input.chargeCurrency !== 'USD') return INVALID_INPUT

  // Phase 9c originally OVERRODE the client's currency with this server geo
  // signal whenever the two disagreed. That was wrong for this product and
  // has been reverted (Phase 9c Task 4): `chargeCurrencyFor`'s own docblock
  // says the charge currency is designed to follow the customer's
  // display-currency choice — there's a shipped `CurrencySwitcher` in the
  // header and a `charge-currency-note` component that tells the customer
  // up front which currency they'll be charged in. Silently overriding that
  // choice contradicts what the UI just told them and, worse, can charge
  // them in a currency their screen never showed (the client keeps
  // rendering prices in the currency IT chose, so an override here produces
  // a total that matches nothing displayed). The signal is also weak
  // grounds for enforcement: prices are dual-authored (NGN and USD are each
  // set independently by the merchant, no FX in this path), and the guard
  // two lines below already ensures only those two authored currencies are
  // ever accepted — so the worst case of trusting the client's choice is a
  // customer paying the merchant's OTHER authored price, a pricing decision
  // rather than a security hole. The effective currency is therefore always
  // `input.chargeCurrency`; the server signal is read and compared ONLY to
  // log a divergence, giving the merchant observability (e.g. to spot
  // systematic arbitrage) without ever second-guessing the customer's
  // explicit selection.
  const serverCurrency = await serverChargeCurrency()
  const chargeCurrency = input.chargeCurrency
  if (serverCurrency && serverCurrency !== chargeCurrency) {
    console.warn('[placeOrder] charge-currency divergence — logging only, using the client currency', {
      client: chargeCurrency,
      server: serverCurrency,
    })
  }

  // The shipping amount/label are never trusted from the client — they come
  // ONLY from a verified, address-bound, unexpired quote token (see the
  // module doc comment above). A tampered/expired/wrong-address token, or a
  // currency mismatch against `chargeCurrency`, is rejected before any
  // pricing work happens. `chargeCurrency` here is always the client's own
  // format-validated value (see the comment above), and `getShippingRates`
  // resolves its quote's currency the same way — off `input.chargeCurrency`,
  // never the server geo signal — so a quote issued for a given client
  // currency is always verified against that same currency here; the two
  // functions can't drift apart.
  const quote = verifyQuote(input.shippingToken, parsedAddress.data)
  if (!quote) return SHIPPING_EXPIRED
  if (quote.currency !== chargeCurrency) return INVALID_INPUT

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
  const lines = buildCartLines(clampedItems, products, chargeCurrency)

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
    shippingLabel: quote.label,
    currency: chargeCurrency,
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
      const order = await db.$transaction(async (tx) =>
        tx.order.create({
          data: { ...orderData, orderNumber, lines: { create: orderLineInputs } },
          include: { lines: true },
        }),
      )

      // Bind a GUEST order to the session that placed it. A guest order has no
      // `profileId`, so payment actions can't scope it by user — an httpOnly
      // cookie is the session-bound proof of ownership, so an anonymous caller
      // can't enumerate order numbers and pay for (take over) a stranger's
      // order. Signed-in orders are scoped by `profileId` and need no cookie.
      if (!userId) {
        const cookieStore = await cookies()
        cookieStore.set('mse_guest_order', order.orderNumber, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          path: '/',
          maxAge: 60 * 60, // 1h — long enough to complete payment
        })
      }

      const result: PlaceOrderResult = { ok: true, order: mapOrderRow(order) }

      // Best-effort save-back, strictly AFTER the order transaction (and the
      // guest-order cookie above) have already resolved. `result` is already
      // fixed at this point and is returned unchanged below regardless of
      // what happens inside `saveAddressBestEffort` — see that function's
      // doc comment for why it can never throw out of here. Belt-and-suspenders:
      // this call sits inside the orderNumber-retry `try`, so a future escape
      // from the helper would masquerade as a unique-violation retry and
      // create a second order — wrap it in its own `try/catch` so that can
      // never happen even if `saveAddressBestEffort` stops holding its
      // never-throws contract.
      if (userId && input.saveAddress === true) {
        try {
          await saveAddressBestEffort(userId, parsedAddress.data)
        } catch (error) {
          console.error('[placeOrder] saveAddressBestEffort unexpectedly threw', error)
        }
      }

      return result
    } catch (error) {
      if (isUniqueViolation(error)) continue // fresh orderNumber, fresh transaction, next attempt
      if (isRecordNotFound(error)) return GENERIC_ERROR
      throw error // matches cart/data.ts: only a truly-unexpected error propagates
    }
  }

  return GENERIC_ERROR // exhausted every orderNumber attempt
}
