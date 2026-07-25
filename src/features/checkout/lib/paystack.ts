import 'server-only'
import crypto from 'node:crypto'

/**
 * Thin, server-only REST wrapper around Paystack's Transactions API plus
 * webhook-signature verification. No `db`, no auth — the payment server
 * actions (`payments.ts`) and the webhook route (`api/paystack/webhook`)
 * are the only callers, and both funnel a verified charge into
 * `markOrderPaid` (`lib/fulfil-order.ts`).
 *
 * `PAYSTACK_SECRET_KEY` is read inside each function (not at module top) so
 * a missing env var only throws when the function actually runs, not at
 * import/build time.
 */

const PAYSTACK_BASE_URL = 'https://api.paystack.co'

export interface PaystackCharge {
  reference: string
  status: string // 'success' | 'failed' | 'abandoned' | ...
  amountMinor: number // Paystack 'amount' (subunit)
  currency: string // 'NGN' | 'USD' | ...
  metadata: { orderNumber?: string }
}

function requireSecretKey(): string {
  const key = process.env.PAYSTACK_SECRET_KEY
  if (!key) throw new Error('PAYSTACK_SECRET_KEY is not set')
  return key
}

/**
 * Paystack's `metadata` is meant to be an object, but the API also returns
 * `null` (no metadata) and — depending on how it was sent — can round-trip
 * as a stringified JSON blob. We only ever read `orderNumber` back out of
 * it, so anything that isn't already a plain object normalizes to `{}`
 * rather than being parsed.
 */
function normalizeMetadata(value: unknown): { orderNumber?: string } {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}
  const orderNumber = (value as Record<string, unknown>).orderNumber
  return typeof orderNumber === 'string' ? { orderNumber } : {}
}

function toCharge(data: {
  reference: string
  status: string
  amount: number
  currency: string
  metadata?: unknown
}): PaystackCharge {
  return {
    reference: data.reference,
    status: data.status,
    amountMinor: data.amount,
    currency: data.currency,
    metadata: normalizeMetadata(data.metadata),
  }
}

/**
 * `POST /transaction/initialize`. `amountMinor` is server-controlled by
 * every caller (see `payments.ts`'s `initializePayment`, which derives it
 * from the stored `Order.totalMinor` — never a client-supplied value).
 * Throws a plain `Error` on a non-2xx response or `status: false`; callers
 * catch and map to `{ error }`.
 */
export async function initializeTransaction(input: {
  email: string
  amountMinor: number
  currency: 'NGN' | 'USD'
  reference: string
  metadata: Record<string, unknown>
}): Promise<{ accessCode: string; reference: string }> {
  const secretKey = requireSecretKey()

  const res = await fetch(`${PAYSTACK_BASE_URL}/transaction/initialize`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: input.email,
      amount: input.amountMinor,
      currency: input.currency,
      reference: input.reference,
      metadata: input.metadata,
    }),
  })

  const body = (await res.json()) as {
    status?: boolean
    message?: string
    data?: { access_code?: string; reference?: string }
  }

  if (!res.ok || body.status !== true || !body.data?.access_code || !body.data?.reference) {
    throw new Error(`Paystack initialize failed: ${body.message ?? res.status}`)
  }

  return { accessCode: body.data.access_code, reference: body.data.reference }
}

/**
 * `GET /transaction/verify/:reference` — the authoritative server check.
 * Throws a plain `Error` on a non-2xx response or `status: false`; callers
 * catch and map to `{ error }`.
 */
export async function verifyTransaction(reference: string): Promise<PaystackCharge> {
  const secretKey = requireSecretKey()

  const res = await fetch(`${PAYSTACK_BASE_URL}/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${secretKey}` },
  })

  const body = (await res.json()) as {
    status?: boolean
    message?: string
    data?: { reference?: string; status?: string; amount?: number; currency?: string; metadata?: unknown }
  }

  if (
    !res.ok ||
    body.status !== true ||
    !body.data ||
    typeof body.data.reference !== 'string' ||
    typeof body.data.status !== 'string' ||
    typeof body.data.amount !== 'number' ||
    typeof body.data.currency !== 'string'
  ) {
    throw new Error(`Paystack verify failed: ${body.message ?? res.status}`)
  }

  return toCharge({
    reference: body.data.reference,
    status: body.data.status,
    amount: body.data.amount,
    currency: body.data.currency,
    metadata: body.data.metadata,
  })
}

/**
 * Verifies the `x-paystack-signature` header against an HMAC-SHA512 of the
 * RAW request body (the caller must pass `await req.text()`, not a
 * re-serialized `JSON.stringify(await req.json())` — Paystack signs the
 * exact bytes it sent). Uses `crypto.timingSafeEqual` on equal-length
 * buffers; a null signature or a length mismatch returns `false` without
 * ever calling `timingSafeEqual` (it throws on unequal-length buffers).
 */
export function verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
  if (!signature) return false

  const secretKey = requireSecretKey()
  const expected = crypto.createHmac('sha512', secretKey).update(rawBody).digest('hex')

  const expectedBuffer = Buffer.from(expected, 'hex')
  const signatureBuffer = Buffer.from(signature, 'hex')
  if (expectedBuffer.length !== signatureBuffer.length) return false

  return crypto.timingSafeEqual(expectedBuffer, signatureBuffer)
}

/**
 * Extracts a `PaystackCharge` from a webhook body for the `charge.success`
 * event; `null` for any other event or a malformed body. `body` is `unknown`
 * because it comes from `JSON.parse` of the raw webhook payload.
 */
export function parseWebhookCharge(body: unknown): PaystackCharge | null {
  if (typeof body !== 'object' || body === null) return null

  const { event, data } = body as { event?: unknown; data?: unknown }
  if (event !== 'charge.success') return null
  if (typeof data !== 'object' || data === null) return null

  const { reference, status, amount, currency, metadata } = data as Record<string, unknown>
  if (typeof reference !== 'string' || typeof status !== 'string' || typeof amount !== 'number' || typeof currency !== 'string') {
    return null
  }

  return toCharge({ reference, status, amount, currency, metadata })
}
