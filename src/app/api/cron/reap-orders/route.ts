import crypto from 'node:crypto'
import { reapAbandonedOrders } from '@/features/admin/orders/reaper'

// Timing-safe compare below uses Node's `crypto`, which the Edge runtime
// doesn't support — this route must run on Node.
export const runtime = 'nodejs'
// A cron hit is a request-specific check against live env/db state and must
// never be statically optimized/cached.
export const dynamic = 'force-dynamic'

/**
 * Verifies `Authorization: Bearer <CRON_SECRET>` via `crypto.timingSafeEqual`
 * on equal-length buffers — same idiom as `verifyWebhookSignature`
 * (`features/checkout/lib/paystack.ts`). A missing header or a length
 * mismatch returns `false` without ever calling `timingSafeEqual` (it throws
 * on unequal-length buffers), so a wrong-length guess can't be distinguished
 * from a wrong-value one by timing.
 */
function isAuthorized(req: Request, secret: string): boolean {
  const header = req.headers.get('authorization')
  if (!header) return false

  const expected = Buffer.from(`Bearer ${secret}`)
  const actual = Buffer.from(header)
  if (expected.length !== actual.length) return false

  return crypto.timingSafeEqual(expected, actual)
}

/**
 * Vercel Cron entrypoint (`vercel.json`, daily at 03:00) for the
 * abandoned-PENDING-order reaper. Secret-gated: `CRON_SECRET` must be set,
 * and the request's `Authorization` header must match it exactly, checked
 * BEFORE any db work so an unauthorized request never touches `db`. Both the
 * "missing env" and "unauthorized" failures return an empty/`{}` body —
 * never a detail that would let a caller distinguish a missing secret from a
 * wrong one.
 */
export async function GET(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    console.error('[cron/reap-orders] CRON_SECRET is not set')
    return Response.json({}, { status: 500 })
  }

  if (!isAuthorized(req, secret)) {
    return Response.json({}, { status: 401 })
  }

  const result = await reapAbandonedOrders()
  if (!result.ok) {
    return Response.json({}, { status: 500 })
  }

  return Response.json({ reaped: result.reaped }, { status: 200 })
}
