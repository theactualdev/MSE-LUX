'use server'

import { revalidatePath } from 'next/cache'
import { getCurrentUserId } from '@/features/auth/claims'
import { enableShare, disableShare, regenerateShareToken, getShareState, type ShareState } from '@/features/gifting/share'
import { listAddresses } from '@/features/account/data'

/**
 * Owner-side share management. These are public HTTP endpoints, so every one
 * re-derives the caller's identity from the session rather than trusting any
 * argument — `enableShare` additionally re-reads the address scoped to that
 * profile, so an address id from another account resolves to nothing.
 */

export type ShareActionResult = { ok: true; token?: string } | { ok: false; error: string }

const SIGNED_OUT: ShareActionResult = { ok: false, error: 'Sign in to share your wishlist.' }
const INVALID: ShareActionResult = { ok: false, error: 'Choose a delivery address first.' }

export async function enableShareAction(addressId: unknown): Promise<ShareActionResult> {
  const userId = await getCurrentUserId()
  if (!userId) return SIGNED_OUT
  if (typeof addressId !== 'string' || !addressId) return INVALID

  const result = await enableShare(userId, addressId)
  if (!result.ok) return INVALID

  revalidatePath('/wishlist')
  return { ok: true, token: result.token }
}

export async function disableShareAction(): Promise<ShareActionResult> {
  const userId = await getCurrentUserId()
  if (!userId) return SIGNED_OUT
  await disableShare(userId)
  revalidatePath('/wishlist')
  return { ok: true }
}

export async function regenerateShareAction(): Promise<ShareActionResult> {
  const userId = await getCurrentUserId()
  if (!userId) return SIGNED_OUT
  const result = await regenerateShareToken(userId)
  if (!result.ok) return { ok: false, error: 'Sharing is not set up yet.' }
  revalidatePath('/wishlist')
  return { ok: true, token: result.token }
}

/** The address fields `SharePanel` actually renders — never a street. */
export interface SharePanelAddress {
  id: string
  fullName: string
  city: string
  state: string
}

export interface SharePanelData {
  shareState: ShareState
  addresses: SharePanelAddress[]
}

/**
 * Everything `SharePanel` needs for the CURRENT session, fetched client-side
 * after mount so `/wishlist`'s server shell has no session-scoped read left
 * and stays static — see that page's header comment. Identity is re-derived
 * from the session exactly like every other action here, never trusted from
 * an argument (there isn't one).
 *
 * `null` is the "signed out" signal `SharePanel` already treats
 * `shareState === null` as, now covering the whole payload rather than just
 * the share state half of it.
 *
 * Addresses are reduced to `SharePanelAddress` here, at the server boundary
 * — `listAddresses()` returns the full `SavedAddress` (street included) for
 * `/account/addresses`, but the wishlist share panel only ever shows
 * city/state (see `localityLabel` in `share-panel.tsx`), so the street never
 * needs to leave the server, let alone reach the client bundle.
 */
export async function getSharePanelDataAction(): Promise<SharePanelData | null> {
  const userId = await getCurrentUserId()
  if (!userId) return null

  const [shareState, addresses] = await Promise.all([getShareState(userId), listAddresses()])

  return {
    shareState,
    addresses: addresses.map(({ id, fullName, city, state }) => ({ id, fullName, city, state })),
  }
}
