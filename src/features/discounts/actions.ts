'use server'

import { z } from 'zod'
import { checkRateLimit, RATE_LIMITED_MESSAGE } from '@/lib/rate-limit'
import { resolveUsableCode } from '@/features/discounts/discount'

/**
 * Checkout's discount preview. SECURITY: this is a public endpoint that
 * answers "does this code work?", i.e. a code-guessing surface. Two defences,
 * and both are needed:
 *   1. ONE generic rejection for every failure — unknown, inactive, expired,
 *      exhausted — so a prober can't learn that a code exists but is spent.
 *   2. The `discountCode` rate-limit bucket, which is what actually bounds
 *      enumeration; the generic message alone does not.
 *
 * This action is a PREVIEW only. `placeOrder` re-resolves the code itself and
 * re-derives the amount — nothing returned here is ever trusted as input to a
 * price.
 */

export type ValidateDiscountResult =
  | { ok: true; code: string; percentOff: number }
  | { ok: false; error: string }

const REJECTED: ValidateDiscountResult = { ok: false, error: "That code isn't valid." }

const codeSchema = z.string().min(1).max(64)

export async function validateDiscountCode(input: unknown): Promise<ValidateDiscountResult> {
  if (!(await checkRateLimit('discountCode'))) return { ok: false, error: RATE_LIMITED_MESSAGE }

  const parsed = codeSchema.safeParse(typeof input === 'string' ? input.trim() : '')
  if (!parsed.success) return REJECTED

  try {
    const usable = await resolveUsableCode(parsed.data)
    if (!usable) return REJECTED
    return { ok: true, code: usable.code, percentOff: usable.percentOff }
  } catch (error) {
    console.error('[validateDiscountCode] engine failure', { error })
    return REJECTED
  }
}
