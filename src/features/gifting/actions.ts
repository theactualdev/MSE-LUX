'use server'

import { revalidatePath } from 'next/cache'
import { getCurrentUserId } from '@/features/auth/claims'
import { enableShare, disableShare, regenerateShareToken } from '@/features/gifting/share'

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
