import 'server-only'

import { randomBytes } from 'node:crypto'
import { db } from '@/lib/db'

/**
 * Wishlist sharing engine (Phase 10c). Owns token lifecycle and the ONE
 * function that turns a share token into a destination: `resolveShare`.
 *
 * `server-only` because this module holds `node:crypto` and `@/lib/db` and
 * returns the recipient's FULL address — a client bundle must never reach it.
 * Callers that need buyer-safe data take `recipientFirstName`/`city`/`state`
 * and leave `address` alone; `address` exists solely so `placeGiftOrder` can
 * snapshot it into the Order server-side.
 */

export interface GiftAddress {
  fullName: string
  phone: string
  line1: string
  line2: string | null
  city: string
  state: string
  country: string
  postalCode: string | null
}

export interface ResolvedShare {
  wishlistId: string
  recipientFirstName: string
  city: string
  state: string
  country: string
  /** SERVER-ONLY. Never serialise this to a buyer-facing surface. */
  address: GiftAddress
  productIds: string[]
}

function newToken(): string {
  return randomBytes(32).toString('hex')
}

/** First token of a full name (falls back to the whole string). */
function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName
}

/**
 * Resolves a share token to its destination, or null. A missing token, a
 * DISABLED share, and a share whose nominated address was deleted all return
 * the SAME null — the caller renders one neutral page, so a visitor can never
 * distinguish "never existed" from "turned off".
 */
export async function resolveShare(token: string): Promise<ResolvedShare | null> {
  if (!token) return null

  const row = await db.wishlist.findUnique({
    where: { shareToken: token },
    include: { giftAddress: true, items: { select: { productId: true } } },
  })

  if (!row || !row.shareEnabled || !row.giftAddress) return null

  const a = row.giftAddress
  return {
    wishlistId: row.id,
    recipientFirstName: firstName(a.fullName),
    city: a.city,
    state: a.state,
    country: a.country,
    address: {
      fullName: a.fullName, phone: a.phone,
      line1: a.line1, line2: a.line2,
      city: a.city, state: a.state, country: a.country, postalCode: a.postalCode,
    },
    productIds: row.items.map((i) => i.productId),
  }
}

/**
 * Turns sharing on and pins the destination. The address is re-read scoped to
 * the caller's profile — an id alone is not proof of ownership on a public
 * action. An existing token is REUSED so re-enabling does not silently break
 * links the owner already handed out.
 */
export async function enableShare(
  profileId: string,
  addressId: string,
): Promise<{ ok: true; token: string } | { ok: false; error: 'no-address' | 'no-wishlist' }> {
  const owned = await db.address.findFirst({ where: { id: addressId, profileId }, select: { id: true } })
  if (!owned) return { ok: false, error: 'no-address' }

  const existing = await db.wishlist.findUnique({ where: { profileId }, select: { id: true, shareToken: true } })
  if (!existing) return { ok: false, error: 'no-wishlist' }

  const token = existing.shareToken ?? newToken()

  await db.wishlist.update({
    where: { id: existing.id },
    data: {
      shareEnabled: true,
      giftAddressId: addressId,
      ...(existing.shareToken ? {} : { shareToken: token }),
    },
  })

  return { ok: true, token }
}

/** Turns sharing off. Deliberately PRESERVES the token — see the schema comment. */
export async function disableShare(profileId: string): Promise<void> {
  await db.wishlist.update({ where: { profileId }, data: { shareEnabled: false } })
}

/** Mints a new token, invalidating every link the owner has already sent. */
export async function regenerateShareToken(
  profileId: string,
): Promise<{ ok: true; token: string } | { ok: false; error: 'not-shared' }> {
  const existing = await db.wishlist.findUnique({ where: { profileId }, select: { id: true, giftAddressId: true } })
  if (!existing || !existing.giftAddressId) return { ok: false, error: 'not-shared' }

  const token = newToken()
  await db.wishlist.update({ where: { id: existing.id }, data: { shareToken: token } })
  return { ok: true, token }
}

/** The owner's current share state, for rendering the panel. */
export async function getShareState(
  profileId: string,
): Promise<{ enabled: boolean; token: string | null; addressId: string | null }> {
  const row = await db.wishlist.findUnique({
    where: { profileId },
    select: { shareEnabled: true, shareToken: true, giftAddressId: true },
  })
  return {
    enabled: row?.shareEnabled ?? false,
    token: row?.shareToken ?? null,
    addressId: row?.giftAddressId ?? null,
  }
}
