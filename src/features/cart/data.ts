'use server'

import { z } from 'zod'
import { db } from '@/lib/db'
import { getCurrentUserId } from '@/features/auth/claims'
import { Prisma } from '@/generated/prisma/client'
import type { CartMutationResult, GuestCartItem } from '@/features/cart/types'

/**
 * Per-user server cart: reads, mutations, and guest-cart merge for signed-in
 * customers. Guests keep their cart in `localStorage`
 * (`src/features/cart/store.ts`); this module only ever runs for a session
 * with a verified `sub` claim.
 *
 * WHY THIS MODULE IS `'use server'` RATHER THAN `import 'server-only'`:
 * the two directives can't coexist — `'use server'` must be the literal
 * first statement of the module, so a `server-only` import above it would
 * conflict. `data.ts` is a Server Actions module instead of a plain
 * server-only one, so every export here is directly callable from the
 * client hook that Task 4 builds (no separate `actions.ts` wrapper, unlike
 * `src/features/account/`). That has one consequence worth being explicit
 * about: **every export of a `'use server'` module is a public HTTP
 * endpoint**, reachable by anyone who can reach this app, not just by code
 * that imports it — the same trust boundary `account/data.ts` describes for
 * its own actions. `GuestCartItem`/`CartMutationResult` live in the sibling
 * `types.ts` (no directive) rather than being exported from here, because a
 * `'use server'` module may only export async functions — a `type` export
 * would violate that constraint.
 *
 * SECURITY — same authorization model as `account/data.ts`: Prisma connects
 * through the pooler as a privileged role and bypasses RLS entirely, so every
 * filter below has to carry the profile id itself.
 *
 * 1. No function here accepts a caller-supplied user id. Each one calls
 *    `getCurrentUserId()` and derives scope from that.
 * 2. Cart rows are looked up by `profileId`, then item writes are scoped by
 *    the resulting `cartId` — `CartItem` has no `profileId` column of its
 *    own, only a `cartId` FK, so that's the only key available to a
 *    `deleteMany`/`upsert` filter once the cart has been resolved.
 *
 * Returns typed results rather than throwing, so a caller (e.g. a route
 * handler) can map them to fixed, non-revealing copy instead of leaking a
 * Prisma error.
 */

const UNAUTHENTICATED: CartMutationResult = { error: 'Please sign in to manage your cart.' }
const INVALID_INPUT: CartMutationResult = { error: 'Please check your cart and try again.' }
const GENERIC_ERROR: CartMutationResult = { error: 'Something went wrong. Please try again.' }

/** Prisma's unique-constraint violation. Matched structurally so this module needn't import the error class. */
function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002'
}

/** Prisma's "record to update/delete not found" error. Matched structurally for the same reason. */
function isRecordNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2025'
}

/**
 * Either the shared client or an interactive-transaction client — every
 * helper below is called from both a bare mutation (`removeCartItem`,
 * `clearServerCart`, which don't need transactional atomicity) and from
 * inside `db.$transaction` (`addCartItem`, `setCartItemQty`,
 * `mergeGuestCart`, where a fetch-or-create Cart and its item write must
 * commit or roll back together).
 */
type DbOrTx = typeof db | Prisma.TransactionClient

const idSchema = z.string().min(1)
const variantIdSchema = z.string().min(1).optional()

const addItemSchema = z.object({
  productId: idSchema,
  variantId: variantIdSchema,
  // The increment a single `addCartItem` call applies — must be positive; a
  // caller wanting to set (or zero out) a line uses `setCartItemQty` instead.
  quantity: z.number().int().positive(),
})

const setQtySchema = z.object({
  productId: idSchema,
  variantId: variantIdSchema,
  // Unlike `addItemSchema`, this is an absolute target and may be <= 0 —
  // see `setCartItemQty`'s doc comment for why that means "remove".
  quantity: z.number().int(),
})

const removeItemSchema = z.object({
  productId: idSchema,
  variantId: variantIdSchema,
})

const guestItemSchema = z.object({
  productId: idSchema,
  variantId: variantIdSchema,
  quantity: z.number().int().positive(),
})

const guestCartSchema = z.array(guestItemSchema)

/** `variantId: undefined` (domain) <-> `variantId: null` (DB / Prisma's compound-unique key). */
function toVariantKey(variantId: string | undefined): string | null {
  return variantId ?? null
}

/**
 * Builds the `(cartId, productId, variantId)` compound-unique key used by
 * every `findUnique`/`upsert` below.
 *
 * The cast is required, not stylistic: Prisma generates
 * `CartItemCartIdProductIdVariantIdCompoundUniqueInput.variantId` as a
 * non-null `string` even though the underlying column is nullable — a known
 * gap in how Prisma types compound-unique inputs on a nullable field. The
 * hand-added `NULLS NOT DISTINCT` index (see the `CartItem` model's own
 * comment in `prisma/schema.prisma`) is exactly what makes passing `null`
 * here valid and necessary at runtime; this is the single place that fact
 * gets asserted past the generated type, instead of an `as string` at every
 * call site.
 */
function cartItemKey(
  cartId: string,
  productId: string,
  variantId: string | null,
): Prisma.CartItemCartIdProductIdVariantIdCompoundUniqueInput {
  return { cartId, productId, variantId } as Prisma.CartItemCartIdProductIdVariantIdCompoundUniqueInput
}

function toDomainItem(row: { productId: string; variantId: string | null; quantity: number }): GuestCartItem {
  return { productId: row.productId, variantId: row.variantId ?? undefined, quantity: row.quantity }
}

/**
 * The user's cart items, in a stable order. `CartItem` has no `createdAt`
 * column (only `Cart` does — see `prisma/schema.prisma`), so `id` (a cuid,
 * whose prefix is time-based) stands in as the closest available proxy for
 * insertion order.
 *
 * Filters `CartItem` by the relation (`cart.profileId`) directly rather than
 * resolving a `Cart` row first — one query instead of two, and there is
 * nothing to write here that would need the id itself.
 */
async function readItems(client: DbOrTx, userId: string): Promise<GuestCartItem[]> {
  const rows = await client.cartItem.findMany({
    where: { cart: { profileId: userId } },
    orderBy: { id: 'asc' },
    select: { productId: true, variantId: true, quantity: true },
  })

  return rows.map(toDomainItem)
}

/**
 * Resolves the inventory that bounds a line's stored quantity: the variant's
 * own `inventory` when `variantId` is given, otherwise the product's. `0`
 * means "unavailable" whether that's because the row is genuinely out of
 * stock or because the id doesn't resolve at all (deleted product, or a
 * variant that doesn't belong to `productId`) — a caller can't tell those
 * apart from the id alone, and shouldn't be able to: either way there is
 * nothing to sell.
 */
async function resolveInventory(client: DbOrTx, productId: string, variantId: string | undefined): Promise<number> {
  if (variantId) {
    const variant = await client.productVariant.findUnique({
      where: { id: variantId },
      select: { inventory: true, productId: true },
    })
    if (!variant || variant.productId !== productId) return 0
    return variant.inventory
  }

  const product = await client.product.findUnique({
    where: { id: productId },
    select: { inventory: true },
  })

  return product?.inventory ?? 0
}

/**
 * Fetch-or-create the signed-in user's `Cart`. There is deliberately no
 * unique constraint on `Cart.profileId` to `upsert` against (the schema only
 * has `@@index([profileId])` — see the brief this task was built from), so
 * this is a plain `findFirst` then `create`. Callers that need this run it
 * inside `db.$transaction` together with the item write that follows, so a
 * concurrent call from the same user can't create two `Cart` rows and then
 * have each write land on a different one.
 */
async function getOrCreateCartId(client: DbOrTx, userId: string): Promise<string> {
  const existing = await client.cart.findFirst({ where: { profileId: userId }, select: { id: true } })
  if (existing) return existing.id

  const created = await client.cart.create({ data: { profileId: userId }, select: { id: true } })
  return created.id
}

/**
 * Writes one cart line's quantity, clamped to inventory.
 *
 * `nextQuantity` receives the line's current quantity (`0` if the line
 * doesn't exist yet) and returns the *requested* quantity — the increment
 * add in `addCartItem`/`mergeGuestCart` passes `(existing) => existing +
 * delta`; the absolute set in `setCartItemQty` passes `() => target`. Either
 * way the result is clamped to `[0, inventory]`: a request that clamps to 0
 * (no inventory, or an explicit non-positive target) removes the line
 * instead of writing a zero-quantity row, so `quantity` in the database is
 * always a positive number a caller can trust without an extra check.
 *
 * Upserts on the `(cartId, productId, variantId)` compound key — the
 * `NULLS NOT DISTINCT` unique index the schema hand-adds for it is exactly
 * what lets `variantId: null` be looked up and written the same way as a
 * real variant id, so a variantless product gets one row per cart, not one
 * per add.
 */
async function writeLineQuantity(
  client: DbOrTx,
  cartId: string,
  productId: string,
  variantId: string | undefined,
  nextQuantity: (existingQuantity: number) => number,
): Promise<void> {
  const variantKey = toVariantKey(variantId)
  const inventory = await resolveInventory(client, productId, variantId)

  if (inventory <= 0) {
    await client.cartItem.deleteMany({ where: { cartId, productId, variantId: variantKey } })
    return
  }

  const existing = await client.cartItem.findUnique({
    where: { cartId_productId_variantId: cartItemKey(cartId, productId, variantKey) },
    select: { quantity: true },
  })

  const requested = nextQuantity(existing?.quantity ?? 0)
  const clamped = Math.min(Math.max(requested, 0), inventory)

  if (clamped <= 0) {
    await client.cartItem.deleteMany({ where: { cartId, productId, variantId: variantKey } })
    return
  }

  await client.cartItem.upsert({
    where: { cartId_productId_variantId: cartItemKey(cartId, productId, variantKey) },
    create: { cartId, productId, variantId: variantKey, quantity: clamped },
    update: { quantity: clamped },
  })
}

/** The signed-in user's cart items, mapped to the domain shape. Empty when unauthenticated or the user has no cart yet. */
export async function getServerCartItems(): Promise<GuestCartItem[]> {
  const userId = await getCurrentUserId()
  if (!userId) return []

  return readItems(db, userId)
}

/**
 * Adds `qty` of a product (optionally a specific variant) to the signed-in
 * user's cart, creating the cart itself if this is their first add. Existing
 * quantity for that line is incremented, then clamped to inventory — see
 * `writeLineQuantity`.
 */
export async function addCartItem(
  productId: string,
  variantId: string | undefined,
  qty: number,
): Promise<CartMutationResult> {
  const userId = await getCurrentUserId()
  if (!userId) return UNAUTHENTICATED

  const parsed = addItemSchema.safeParse({ productId, variantId, quantity: qty })
  if (!parsed.success) return INVALID_INPUT

  try {
    await db.$transaction(async (tx) => {
      const cartId = await getOrCreateCartId(tx, userId)
      await writeLineQuantity(
        tx,
        cartId,
        parsed.data.productId,
        parsed.data.variantId,
        (existing) => existing + parsed.data.quantity,
      )
    })
  } catch (error) {
    if (isUniqueViolation(error) || isRecordNotFound(error)) return GENERIC_ERROR
    throw error
  }

  return { ok: true, items: await readItems(db, userId) }
}

/**
 * Sets a cart line to an absolute quantity, clamped to inventory. `qty <= 0`
 * removes the line — the caller doesn't need a separate `removeCartItem`
 * call to express "drag the stepper down to zero".
 *
 * Only fetches-or-creates the cart when there is something to write
 * (`qty > 0`): a zero/negative request against a profile with no cart yet
 * has nothing to remove, so it's reported as a no-op success rather than
 * creating an empty `Cart` row just to immediately find nothing to delete
 * from it.
 */
export async function setCartItemQty(
  productId: string,
  variantId: string | undefined,
  qty: number,
): Promise<CartMutationResult> {
  const userId = await getCurrentUserId()
  if (!userId) return UNAUTHENTICATED

  const parsed = setQtySchema.safeParse({ productId, variantId, quantity: qty })
  if (!parsed.success) return INVALID_INPUT

  try {
    await db.$transaction(async (tx) => {
      const variantKey = toVariantKey(parsed.data.variantId)

      if (parsed.data.quantity <= 0) {
        const cart = await tx.cart.findFirst({ where: { profileId: userId }, select: { id: true } })
        if (!cart) return

        await tx.cartItem.deleteMany({ where: { cartId: cart.id, productId: parsed.data.productId, variantId: variantKey } })
        return
      }

      const cartId = await getOrCreateCartId(tx, userId)
      await writeLineQuantity(tx, cartId, parsed.data.productId, parsed.data.variantId, () => parsed.data.quantity)
    })
  } catch (error) {
    if (isUniqueViolation(error) || isRecordNotFound(error)) return GENERIC_ERROR
    throw error
  }

  return { ok: true, items: await readItems(db, userId) }
}

/**
 * Removes one line from the signed-in user's cart. `deleteMany` (not
 * `delete`) scoped by the resolved `cartId`, mirroring
 * `account/data.ts`'s `updateMany`/`deleteMany` convention — `CartItem` has
 * no `profileId` column to add to a `where`, so the cart must be resolved to
 * its id first and every line write scoped to that id.
 */
export async function removeCartItem(productId: string, variantId: string | undefined): Promise<CartMutationResult> {
  const userId = await getCurrentUserId()
  if (!userId) return UNAUTHENTICATED

  const parsed = removeItemSchema.safeParse({ productId, variantId })
  if (!parsed.success) return INVALID_INPUT

  const cart = await db.cart.findFirst({ where: { profileId: userId }, select: { id: true } })
  if (cart) {
    await db.cartItem.deleteMany({
      where: { cartId: cart.id, productId: parsed.data.productId, variantId: toVariantKey(parsed.data.variantId) },
    })
  }

  return { ok: true, items: await readItems(db, userId) }
}

/** Empties the signed-in user's cart. A no-op success (not an error) when they have no cart yet. */
export async function clearServerCart(): Promise<CartMutationResult> {
  const userId = await getCurrentUserId()
  if (!userId) return UNAUTHENTICATED

  const cart = await db.cart.findFirst({ where: { profileId: userId }, select: { id: true } })
  if (cart) {
    await db.cartItem.deleteMany({ where: { cartId: cart.id } })
  }

  return { ok: true, items: [] }
}

/**
 * Merges a guest (localStorage) cart into the signed-in user's server cart:
 * every guest line runs through the same increment-then-clamp write as
 * `addCartItem`, so a key already on the server sums both quantities rather
 * than being overwritten, and every line still respects inventory.
 *
 * All lines are written inside one `db.$transaction` (one fetch-or-create of
 * the cart, then one `writeLineQuantity` per guest line) so the merge is
 * all-or-nothing. Reads the guest payload once and does not mutate it or any
 * external store — safe to call idempotently, per the interface contract:
 * the caller (Task 9) is expected to clear `localStorage` only after this
 * resolves `ok`.
 */
export async function mergeGuestCart(items: GuestCartItem[]): Promise<CartMutationResult> {
  const userId = await getCurrentUserId()
  if (!userId) return UNAUTHENTICATED

  const parsed = guestCartSchema.safeParse(items)
  if (!parsed.success) return INVALID_INPUT

  try {
    await db.$transaction(async (tx) => {
      const cartId = await getOrCreateCartId(tx, userId)

      for (const item of parsed.data) {
        await writeLineQuantity(tx, cartId, item.productId, item.variantId, (existing) => existing + item.quantity)
      }
    })
  } catch (error) {
    if (isUniqueViolation(error) || isRecordNotFound(error)) return GENERIC_ERROR
    throw error
  }

  return { ok: true, items: await readItems(db, userId) }
}
