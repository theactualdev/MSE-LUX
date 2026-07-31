'use server'

import { z } from 'zod'
import { redirect } from 'next/navigation'
import { checkRateLimit, RATE_LIMITED_MESSAGE } from '@/lib/rate-limit'
import { processSubscription, unsubscribeByToken } from '@/features/newsletter/subscription'
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
 *
 * ACCEPTED RESIDUAL CHANNEL (latency): the CONFIRMED no-op path returns
 * after one DB read, while every send path also awaits the email network
 * call, so response latency still correlates with entry state even though
 * the body is byte-identical. This is accepted rather than fixed: not
 * awaiting the send would make it fire-and-forget, which serverless can
 * kill once the response returns (the reason 9b senders await in the first
 * place); an artificial matching delay is fragile and rots as send latency
 * drifts. The newsletter rate limiter (20 requests / 300s per IP, see
 * checkRateLimit above) bounds the oracle to 20 timing probes per window
 * WHILE UPSTASH IS HEALTHY — `checkRateLimit` fails OPEN by design (missing
 * env / Redis down => allow), so the oracle is unbounded during an outage.
 * Still accepted: the leak is one bit per probe about an address the
 * attacker already knows.
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

/** The unsubscribe form's POST. GET renders the form; only this changes state
 *  (owner decision after the 10a whole-branch review — side-effecting GETs
 *  let mail-gateway prefetchers silently unsubscribe confirmed subscribers).
 *  Post/redirect/get: success lands on ?done=1 so refresh re-fires nothing. */
export async function confirmUnsubscribe(formData: FormData): Promise<void> {
  const token = formData.get('token')
  if (typeof token !== 'string' || !token) redirect('/newsletter/unsubscribe')
  const result = await unsubscribeByToken(token)
  redirect(result === 'unsubscribed' ? '/newsletter/unsubscribe?done=1' : '/newsletter/unsubscribe')
}
