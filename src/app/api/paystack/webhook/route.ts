import { verifyWebhookSignature, parseWebhookCharge } from '@/features/checkout/lib/paystack'
import { markOrderPaid } from '@/features/checkout/lib/fulfil-order'

// Signature verification uses Node's `crypto` (HMAC-SHA512 + timingSafeEqual),
// which the Edge runtime doesn't support — this route must run on Node.
export const runtime = 'nodejs'
// A webhook is inherently dynamic (a POST with a request-specific body) and
// must never be statically optimized/cached.
export const dynamic = 'force-dynamic'

/**
 * Paystack webhook — the authoritative, signature-verified fulfilment path.
 * Fulfils an order on `charge.success` whether or not the client's inline
 * popup ever calls back. Funnels into the same idempotent `markOrderPaid`
 * used by the server `verifyPayment` action (Task 5).
 *
 * Always returns 200 for a signature-verified request — Paystack retries any
 * non-2xx response, so surfacing a downstream error as a 500 would make it
 * retry a poison event forever. Only an unverified signature is rejected
 * (401), and that happens before the body is parsed or touched further.
 */
export async function POST(req: Request): Promise<Response> {
  // Read the RAW body — Paystack signs the exact bytes it sent. Re-serializing
  // via req.json() would not reproduce the same bytes and the HMAC would not
  // match.
  const rawBody = await req.text()
  const signature = req.headers.get('x-paystack-signature')

  if (!verifyWebhookSignature(rawBody, signature)) {
    return new Response('Invalid signature', { status: 401 })
  }

  let charge
  try {
    charge = parseWebhookCharge(JSON.parse(rawBody))
  } catch {
    charge = null
  }

  if (charge) {
    try {
      await markOrderPaid(charge)
    } catch (error) {
      // Defense-in-depth: markOrderPaid never throws (it catches internally),
      // but a signature-verified request must still get a 200 even if it did.
      console.error('[paystack webhook] unexpected error in markOrderPaid', error)
    }
  }

  return new Response(null, { status: 200 })
}
