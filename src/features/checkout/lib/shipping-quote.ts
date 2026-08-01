import 'server-only'
import crypto from 'node:crypto'
import type { Address } from '@/features/checkout/schema'
import type { ShippingQuotePayload } from '@/features/checkout/shipping-types'

/**
 * Signs and verifies the tamper-proof, address-bound, expiring shipping-quote
 * token that lets `placeOrder` trust a shipping amount without re-fetching it
 * from ShipBubble — mirrors the Phase 6 "amount is server-controlled" idiom
 * in `paystack.ts` (HMAC, `crypto`, `server-only`, timing-safe compare).
 *
 * `SHIPBUBBLE_QUOTE_SECRET` is read inside each function (not at module top)
 * so a missing env var only throws when the function actually runs, not at
 * import/build time.
 */

function requireSecret(): string {
  const secret = process.env.SHIPBUBBLE_QUOTE_SECRET
  if (!secret) throw new Error('SHIPBUBBLE_QUOTE_SECRET is not set')
  return secret
}

/**
 * A stable KEYED (HMAC-SHA256) digest over the normalized destination fields
 * that matter for a shipping quote — `line1|city|state|country|postalCode`,
 * each trimmed and lowercased (a missing `postalCode`/`line2` normalizes to
 * `''`). Deliberately excludes `fullName`/`phone`/`line2`: a quote is bound to
 * the delivery location, and those don't change the rate.
 *
 * WHY KEYED RATHER THAN A PLAIN `createHash` (Phase 10c fix): this digest is
 * embedded in the quote token's payload, and that payload is plain
 * base64url — the buyer's browser holds it and can read it. An UNSALTED
 * SHA-256 is therefore an offline oracle for the address it commits to. That
 * is fatal on the gift flow specifically: the buyer is TOLD the recipient's
 * city/state/country by design, so only `line1` and `postalCode` are unknown
 * and a candidate list from public street data is small enough to hash
 * exhaustively — recovering the exact address this whole feature exists to
 * hide. Keying the digest with `SHIPBUBBLE_QUOTE_SECRET` (the same secret
 * `signQuote` uses; there is only one) removes the oracle: without the secret
 * no candidate can be tested at all. The verification property is unchanged —
 * `verifyQuote` recomputes this on the server, where the secret is available.
 *
 * CONSEQUENCE: changing the digest INVALIDATES in-flight quote tokens. That is
 * acceptable — the TTL is 30 minutes, so the window is small and self-healing
 * (a stale token surfaces as the ordinary "quote expired, please try again"),
 * and nothing persisted depends on it: `addressHash` is never written to a
 * column, it only ever lives inside a token.
 *
 * A missing `SHIPBUBBLE_QUOTE_SECRET` now throws here as it already did in
 * `signQuote`/`verifyQuote` — a server misconfiguration, not a bad input. See
 * `shipping.ts`'s `hasQuoteSecret` guard: every path in `getShippingRates`
 * that reaches this function already had to survive `signQuote` throwing on
 * the same missing secret, so this adds no new escape route.
 */
export function addressHash(address: Address): string {
  const secret = requireSecret()
  const normalize = (value: string | undefined) => (value ?? '').trim().toLowerCase()
  const parts = [address.line1, address.city, address.state, address.country, address.postalCode].map(normalize)
  return crypto.createHmac('sha256', secret).update(parts.join('|')).digest('hex')
}

/**
 * `base64url(JSON(payload)) + '.' + HMAC-SHA256(that, SHIPBUBBLE_QUOTE_SECRET)`.
 */
export function signQuote(payload: ShippingQuotePayload): string {
  const secret = requireSecret()
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig = crypto.createHmac('sha256', secret).update(body).digest('hex')
  return `${body}.${sig}`
}

/**
 * Recomputes the HMAC of the token body and compares it with
 * `crypto.timingSafeEqual` (guarding equal length first — `timingSafeEqual`
 * throws on a length mismatch). Returns the payload only if the signature
 * matches AND it hasn't expired AND it was signed for this exact address;
 * otherwise `null`. A malformed token (missing parts, bad base64url/JSON) also
 * returns `null` rather than throwing.
 *
 * A missing `SHIPBUBBLE_QUOTE_SECRET` still throws — that's a server
 * misconfiguration, not a bad token.
 */
export function verifyQuote(token: string, address: Address): ShippingQuotePayload | null {
  const secret = requireSecret()

  const [body, sig] = token.split('.')
  if (!body || !sig) return null

  const expectedSig = crypto.createHmac('sha256', secret).update(body).digest('hex')

  const expectedBuffer = Buffer.from(expectedSig, 'hex')
  const sigBuffer = Buffer.from(sig, 'hex')
  if (expectedBuffer.length !== sigBuffer.length) return null
  if (!crypto.timingSafeEqual(expectedBuffer, sigBuffer)) return null

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as ShippingQuotePayload

    if (payload.exp <= Date.now()) return null
    if (payload.addressHash !== addressHash(address)) return null

    return payload
  } catch {
    return null
  }
}
