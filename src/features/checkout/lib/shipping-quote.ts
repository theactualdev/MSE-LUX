import 'server-only'
import crypto from 'node:crypto'
import type { Address } from '@/features/checkout/schema'
import type { ShippingQuotePayload, VerifiedQuotePayload } from '@/features/checkout/shipping-types'

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
 * A stable KEYED (HMAC-SHA256) digest over a per-quote SALT and the
 * normalized destination fields that matter for a shipping quote —
 * `salt|line1|city|state|country|postalCode`, the address fields each
 * trimmed and lowercased (a missing `postalCode`/`line2` normalizes to `''`).
 * Deliberately excludes `fullName`/`phone`/`line2`: a quote is bound to the
 * delivery location, and those don't change the rate.
 *
 * WHY KEYED *AND* SALTED (Phase 10c fix, round 2): this digest is embedded in
 * the quote token's payload, and that payload is plain base64url — the
 * buyer's browser holds it and can read it. An UNSALTED SHA-256 was an
 * offline oracle for the address it commits to, which keying with
 * `SHIPBUBBLE_QUOTE_SECRET` closed — but keying alone left an ONLINE oracle
 * open: `getShippingRates` is a public Server Action that will happily hash
 * and sign whatever address a caller supplies, so a buyer holding a genuine
 * token could call it once per candidate address and compare the returned
 * `addressHash` against the one in their own token until one matched. That is
 * fatal on the gift flow specifically: the buyer is TOLD the recipient's
 * city/state/country by design, so only `line1` and `postalCode` are unknown,
 * and a candidate list from public street data is small enough to probe this
 * way — recovering the exact address this whole feature exists to hide.
 *
 * The random per-quote `salt` (`newQuoteSalt()`) closes that: it is mixed
 * into the HMAC message, so a hash is only meaningful together with the exact
 * salt that produced it. An attacker mints their OWN token (and therefore
 * their own salt) for each candidate address, so the resulting hash can never
 * be compared against the hash carried in the token they already hold — the
 * two were never computed under the same salt. THE ACCURATE CLAIM IS
 * THEREFORE: a hash is only meaningful within the token that carries it; a
 * caller cannot mint a comparable hash for a guessed address, online or
 * offline. (It is NOT that "without the secret no candidate can be tested at
 * all" — that was true while keying alone was the whole fix, but it doesn't
 * hold once the caller can mint their own signed, differently-salted token
 * for free.) The verification property is unchanged — `verifyQuote`
 * recomputes this on the server, using the salt carried in the payload being
 * verified.
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
export function addressHash(address: Address, salt: string): string {
  const secret = requireSecret()
  const normalize = (value: string | undefined) => (value ?? '').trim().toLowerCase()
  const parts = [address.line1, address.city, address.state, address.country, address.postalCode].map(normalize)
  return crypto.createHmac('sha256', secret).update(`${salt}|${parts.join('|')}`).digest('hex')
}

/**
 * A fresh random per-quote salt for `addressHash` — 16 bytes of CSPRNG
 * output, hex-encoded. Callers mint ONE of these per quote and use it for
 * both the `addressHash` call and the payload's `salt` field, so the hash and
 * the salt that produced it always travel together in the same token.
 */
export function newQuoteSalt(): string {
  return crypto.randomBytes(16).toString('hex')
}

/**
 * A stable, unforgeable REFERENCE to a wishlist share token, for
 * `ShippingQuotePayload.shareRef` — HMAC-SHA256 under the same
 * `SHIPBUBBLE_QUOTE_SECRET` every other function here uses, over a
 * domain-separated message so a share reference can never collide with an
 * `addressHash` computed over some crafted salt/address combination.
 *
 * WHY A REFERENCE RATHER THAN THE TOKEN: the quote payload is plain base64url
 * and the buyer's browser can read it, so embedding the raw share token would
 * hand out a capability — the share token IS the URL that resolves the
 * recipient's wishlist. The HMAC commits to it without disclosing it.
 *
 * WHY IT LIVES HERE: this is the one module that owns the quote secret, and
 * `shareRefFor` must produce the same value at mint time
 * (`getGiftShippingRates`) and at spend time (`placeGiftOrder`). Hashing
 * inline at either call site would risk the two drifting apart, which would
 * silently break every legitimate gift purchase.
 *
 * Throws on a missing secret, exactly like `addressHash`/`signQuote`/
 * `verifyQuote` — a server misconfiguration, not a bad input. Both call sites
 * already catch that case and degrade to their own typed failure.
 */
export function shareRefFor(shareToken: string): string {
  const secret = requireSecret()
  return crypto.createHmac('sha256', secret).update(`share|${shareToken}`).digest('hex')
}

/**
 * `base64url(JSON(payload)) + '.' + HMAC-SHA256(that, SHIPBUBBLE_QUOTE_SECRET)`.
 *
 * Takes the FULL `ShippingQuotePayload`, `scope` included and required, so
 * every mint site has to state which flow it is minting for. (`verifyQuote`
 * returns the laxer `VerifiedQuotePayload` — see that type for why the two
 * deliberately differ.)
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
 *
 * Returns `VerifiedQuotePayload`, NOT `ShippingQuotePayload`: the body below
 * is a `JSON.parse` cast, so the compile-time shape is an assumption about
 * bytes we did not necessarily mint under today's code. `scope` is optional
 * there for exactly that reason — see that type's doc comment.
 */
export function verifyQuote(token: string, address: Address): VerifiedQuotePayload | null {
  const secret = requireSecret()

  const [body, sig] = token.split('.')
  if (!body || !sig) return null

  const expectedSig = crypto.createHmac('sha256', secret).update(body).digest('hex')

  const expectedBuffer = Buffer.from(expectedSig, 'hex')
  const sigBuffer = Buffer.from(sig, 'hex')
  if (expectedBuffer.length !== sigBuffer.length) return null
  if (!crypto.timingSafeEqual(expectedBuffer, sigBuffer)) return null

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as VerifiedQuotePayload

    if (payload.exp <= Date.now()) return null
    if (payload.addressHash !== addressHash(address, payload.salt)) return null

    return payload
  } catch {
    return null
  }
}
