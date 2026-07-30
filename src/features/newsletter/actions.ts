'use server'

import { z } from 'zod'
import { checkRateLimit, RATE_LIMITED_MESSAGE } from '@/lib/rate-limit'
import { processSubscription } from '@/features/newsletter/subscription'
import { sendNewsletterConfirmation } from '@/features/email/send'

/**
 * The public footer-form action. SECURITY (enumeration): every entry state —
 * new address, already pending, already confirmed, previously unsubscribed —
 * returns the byte-identical SUBSCRIBED response, so this endpoint can never
 * be used to test whether an address is on the list (same reasoning as the
 * order-lookup 404s and requireRole's notFound()). Rate-limited (it sends
 * email — a cost surface) and zod-validated; the engine sees only a
 * normalised address. The DB write commits inside the engine BEFORE the
 * best-effort send — a failed send is recoverable by resubmitting, so it
 * never fails the subscription.
 */

export type SubscribeResult = { ok: true; message: string } | { ok: false; error: string }

const SUBSCRIBED: SubscribeResult = { ok: true, message: 'Check your email to confirm your subscription.' }
const INVALID: SubscribeResult = { ok: false, error: 'Enter a valid email address.' }
const FAILED: SubscribeResult = { ok: false, error: 'Something went wrong. Please try again.' }

const emailSchema = z.string().min(3).max(254).email()

export async function subscribe(input: unknown): Promise<SubscribeResult> {
  if (!(await checkRateLimit('newsletter'))) return { ok: false, error: RATE_LIMITED_MESSAGE }

  const normalised = typeof input === 'string' ? input.trim().toLowerCase() : ''
  const parsed = emailSchema.safeParse(normalised)
  if (!parsed.success) return INVALID

  try {
    const outcome = await processSubscription(parsed.data)
    if (outcome.send) {
      await sendNewsletterConfirmation({ email: outcome.email, token: outcome.token })
    }
    return SUBSCRIBED
  } catch (error) {
    console.error('[subscribe] engine failure', { error })
    return FAILED
  }
}
