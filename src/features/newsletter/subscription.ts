import { randomBytes } from 'node:crypto'
import { db } from '@/lib/db'
import { SubscriberStatus } from '@/generated/prisma/client'

/**
 * Newsletter subscription engine (Phase 10a). Directive-free on purpose:
 * `actions.ts` wraps `processSubscription` for the public form, while the
 * confirm/unsubscribe PAGES call the other two directly from their server
 * components. All flows are idempotent — mail clients and link scanners
 * prefetch URLs, so a second visit must never error or double-write.
 *
 * Spec: docs/phases/phase-10-post-launch-features/spec-newsletter.md.
 */

export type SubscribeOutcome = { send: true; email: string; token: string } | { send: false }

/**
 * The subscribe state machine, on an ALREADY-NORMALISED email (the action
 * owns trim/lowercase — this module trusts its caller so the unique index
 * stays meaningful):
 *
 *   no row        -> create PENDING + fresh token -> send
 *   PENDING       -> resend (same token, no write)
 *   CONFIRMED     -> no-op (caller still shows the generic success)
 *   UNSUBSCRIBED  -> back to PENDING, clear unsubscribedAt -> send
 *
 * The DB write always commits before the caller attempts any email.
 */
export async function processSubscription(email: string): Promise<SubscribeOutcome> {
  const existing = await db.subscriber.findUnique({ where: { email } })

  if (!existing) {
    const token = randomBytes(32).toString('hex')
    await db.subscriber.create({ data: { email, token } })
    return { send: true, email, token }
  }

  if (existing.status === SubscriberStatus.PENDING) {
    return { send: true, email: existing.email, token: existing.token }
  }

  if (existing.status === SubscriberStatus.UNSUBSCRIBED) {
    await db.subscriber.update({
      where: { id: existing.id },
      data: { status: SubscriberStatus.PENDING, unsubscribedAt: null },
    })
    return { send: true, email: existing.email, token: existing.token }
  }

  // CONFIRMED — nothing to do; the caller's response is identical regardless.
  return { send: false }
}

/** Idempotent confirm. UNSUBSCRIBED re-confirms (an old link, clicked deliberately). */
export async function confirmByToken(token: string): Promise<'confirmed' | 'invalid'> {
  if (!token) return 'invalid'
  const row = await db.subscriber.findUnique({ where: { token } })
  if (!row) return 'invalid'

  if (row.status !== SubscriberStatus.CONFIRMED) {
    await db.subscriber.update({
      where: { id: row.id },
      data: { status: SubscriberStatus.CONFIRMED, confirmedAt: new Date(), unsubscribedAt: null },
    })
  }
  return 'confirmed'
}

/** Idempotent unsubscribe. The row is RETAINED (spec: it is the do-not-re-import evidence). */
export async function unsubscribeByToken(token: string): Promise<'unsubscribed' | 'invalid'> {
  if (!token) return 'invalid'
  const row = await db.subscriber.findUnique({ where: { token } })
  if (!row) return 'invalid'

  if (row.status !== SubscriberStatus.UNSUBSCRIBED) {
    await db.subscriber.update({
      where: { id: row.id },
      data: { status: SubscriberStatus.UNSUBSCRIBED, unsubscribedAt: new Date() },
    })
  }
  return 'unsubscribed'
}
