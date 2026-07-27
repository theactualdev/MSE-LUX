import 'server-only'
import { Resend } from 'resend'

/**
 * Thin, server-only wrapper around Resend's transactional email API.
 * Mirrors the `paystack.ts`/`shipbubble.ts` idiom (Phases 6-7): secrets
 * (`RESEND_API_KEY`, `EMAIL_FROM`) are read INSIDE the function, never at
 * module scope, so a machine with no email config can still import this
 * module (e.g. at build time, or in a dev/test environment that never
 * sends mail).
 *
 * KEY DIFFERENCE from those two clients: they throw on failure and expect
 * callers to catch. `sendEmail` NEVER throws — it always resolves to a
 * typed `SendEmailResult`. Every caller of this function is a best-effort
 * transactional sender (order confirmations, shipping notices, etc.) whose
 * entire point is that an email problem — missing config, a Resend API
 * error, a network failure — must never surface as a failure anywhere else
 * (an order must still place, a shipment must still be marked fulfilled,
 * even if the notification email didn't go out). The whole body runs in a
 * try/catch; every failure path is logged (`console.error`) and returned,
 * never rethrown.
 */

export interface SendEmailInput {
  to: string
  subject: string
  html: string
}

export type SendEmailResult = { ok: true; id: string | null } | { ok: false; error: 'not-configured' | 'send-failed' }

/**
 * Hard cap on how long `sendEmail` may take before it gives up and resolves
 * to `send-failed`. This function now sits, awaited, on three
 * latency-sensitive paths: the Paystack webhook's HTTP response, the
 * customer's post-payment `verifyPayment` spinner, and the admin's ship
 * action — a hung Resend request with no cap would block all three
 * indefinitely. Implemented with `Promise.race` against a `setTimeout`
 * rather than an `AbortSignal` so it doesn't depend on the Resend SDK
 * actually honoring abort.
 */
const EMAIL_TIMEOUT_MS = 5000

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  try {
    const apiKey = process.env.RESEND_API_KEY
    const from = process.env.EMAIL_FROM

    if (!apiKey || !from) {
      console.error('[sendEmail] not configured — RESEND_API_KEY and/or EMAIL_FROM is unset')
      return { ok: false, error: 'not-configured' }
    }

    const resend = new Resend(apiKey)

    let timeoutId: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<'timeout'>((resolve) => {
      timeoutId = setTimeout(() => resolve('timeout'), EMAIL_TIMEOUT_MS)
    })

    const result = await Promise.race([
      resend.emails.send({
        from,
        to: input.to,
        subject: input.subject,
        html: input.html,
      }),
      timeout,
    ])

    clearTimeout(timeoutId)

    if (result === 'timeout') {
      console.error(`[sendEmail] timed out after ${EMAIL_TIMEOUT_MS}ms`)
      return { ok: false, error: 'send-failed' }
    }

    const { data, error } = result

    if (error) {
      console.error('[sendEmail] Resend returned an error', error)
      return { ok: false, error: 'send-failed' }
    }

    return { ok: true, id: data?.id ?? null }
  } catch (error) {
    console.error('[sendEmail] unexpected error', error)
    return { ok: false, error: 'send-failed' }
  }
}
