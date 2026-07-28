import 'server-only'
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import { headers } from 'next/headers'

/**
 * Thin, server-only wrapper around Upstash's REST rate limiter. Mirrors the
 * `sendEmail` idiom (`src/features/email/client.ts`, Phase 9b): secrets
 * (`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`) are read INSIDE the
 * function, never at module scope, so a machine with no Upstash config can
 * still import this module (build time, or a dev/test environment that
 * never talks to Redis).
 *
 * THE DEFINING PROPERTY: fail OPEN. Every failure mode — missing env, Redis
 * unreachable, the limiter throwing, a malformed (non-throwing but
 * shape-mismatched) response — resolves `true` (proceed), logged. A
 * malformed response doesn't throw, so it can't be caught by the try/catch
 * below; `result?.success` is explicitly checked to be a `boolean` before
 * it's trusted, so a resolved `{}` or `{ success: undefined }` still fails
 * open instead of silently coercing to a falsy "block". This has sat open
 * since Phase 6 as the platform's longest-
 * standing launch blocker: the payment actions (`initializePayment`,
 * `verifyPayment`) are a carding surface with no throttling. But a rate
 * limiter that BLOCKS checkout when Upstash has an incident would be worse
 * than the abuse it's meant to prevent, so every error path here is logged
 * (`console.error`) and returns `true`, never thrown.
 */

/**
 * Named windows — tuned conservatively; a real customer never hits these.
 *
 * `search` is deliberately more generous than the others: it's a cheap,
 * read-only query behind a debounced client (not a write, not a charge), and
 * every bucket here is pure-IP. The primary market is Nigerian mobile CGNAT,
 * where many customers share one carrier-assigned address — a shared bucket
 * that's too tight doesn't prompt a retry, it silently renders as a WRONG
 * "no results" for a query a limited-out customer never even typed. 120/60s
 * gives a shared-IP crowd real headroom while still bounding a single abusive
 * client.
 */
export const RATE_LIMITS = {
  // The carding-surface window — same limit/window shared by two DIFFERENT
  // keyings, not one bucket: IP-keyed at `initializePayment` (no identifier
  // argument — the plain per-caller bucket), and reference-keyed at
  // `verifyPayment` (`checkRateLimit('payment', reference)` — one bucket per
  // Paystack reference, layered under the separate IP-keyed `verify` window
  // below). See `verifyPayment`'s call site (`payments.ts`) for why
  // `verifyPayment` needs a second, IP-keyed check on top of this one.
  payment: { limit: 10, windowSeconds: 60 },
  checkout: { limit: 20, windowSeconds: 60 }, // placeOrder — a WRITE (creates a PENDING order), stays tight
  // The read-only shipping-quote lookup (`getShippingRates`), split out of
  // `checkout` (Phase 9c final fixes). It shares `checkout`'s CGNAT reality —
  // the primary market is Nigerian mobile CGNAT, where many customers behind
  // one carrier IP each fire 2-4 quote calls per checkout session (address
  // edits, a currency-switcher toggle, a shipping-option refresh) — but
  // unlike `placeOrder` it writes nothing and costs no more than a ShipBubble
  // read. A shared 20/60s bucket sized for `placeOrder`'s writes starves
  // ~5-10 concurrent legitimate checkouts behind one NAT with no attacker
  // involved, and the fallback on a limit hit is a FLAT rate quoted silently
  // in place of the real courier price — a monetary, not just cosmetic, cost
  // to a real customer. Sized generously like `search`/`verify` for the same
  // reason those are.
  shippingQuote: { limit: 60, windowSeconds: 60 }, // getShippingRates — read-only, never charges/writes
  search: { limit: 120, windowSeconds: 60 }, // searchCatalog
  // A coarse IP-keyed BACKSTOP for signIn / signUp / requestPasswordReset —
  // NOT the primary brute-force defence anymore (see `authIdentity` below).
  // Sized for the same shared-carrier-NAT reality `search` above is: the
  // primary market is Nigerian mobile CGNAT, where many customers share one
  // carrier-assigned IP. A tight per-IP limit here doesn't just inconvenience
  // an attacker — it locks out every real customer behind that address,
  // denying sign-in/sign-up/password-reset to a whole carrier's worth of
  // legitimate traffic over ~10 cheap attacker requests. 40/300s gives that
  // shared IP real headroom while still bounding a single abusive client;
  // the actual credential-stuffing/enumeration guard is now `authIdentity`.
  auth: { limit: 40, windowSeconds: 300 },
  // The targeted per-email guard for signIn / requestPasswordReset — the
  // REAL credential-stuffing/enumeration defence, keyed by the normalised
  // email rather than IP, so it's completely unaffected by how many
  // legitimate customers share the caller's carrier IP. Deliberately tight
  // (5/300s) since a genuine user rarely retries a login or reset more than
  // a few times in five minutes, while an attacker grinding one address's
  // password (or probing whether it has an account) hits this wall long
  // before `auth`'s generous IP backstop would ever engage.
  authIdentity: { limit: 5, windowSeconds: 300 },
  // An IP-keyed backstop for `verifyPayment`, layered ON TOP of its
  // reference-keyed 'payment' check (never a replacement for it). Reference
  // rotation is free to a caller — `reference` is a caller-supplied argument
  // on a public, unauthenticated Server Action — so a reference-only key lets
  // one host mint unlimited references and drive unbounded authenticated
  // `verifyTransaction` calls to api.paystack.co. Deliberately generous
  // (60/60s, 6x `payment`'s 10/60s) so a shared/CGNAT IP can never starve a
  // real confirmation (one of sixty), while still capping reference-rotation
  // abuse at 60/min instead of unlimited.
  verify: { limit: 60, windowSeconds: 60 },
} as const

export type RateLimitKind = keyof typeof RATE_LIMITS

/**
 * Shared copy for a rate-limited action result. Exported so every caller
 * that surfaces a rate-limit error to the user (`placeOrder`, `initializePayment`,
 * `verifyPayment`) builds its typed `{ error }` constant from this ONE string
 * instead of each re-typing the literal.
 */
export const RATE_LIMITED_MESSAGE = 'Too many attempts. Please wait a moment and try again.'

/**
 * Resolves the caller's IP from request headers for use as the rate-limit
 * identifier. Precedence: `x-forwarded-for`'s first entry (the original
 * client, per the usual proxy-chain convention), else `x-real-ip`, else the
 * literal `'unknown'`.
 *
 * `'unknown'` is a SHARED bucket: every caller with neither header present
 * counts against the same window. That's deliberate — it's the fail-safe
 * for the abuse case (better to rate-limit a shared bucket of unidentified
 * callers than to skip limiting them entirely) — and harmless in practice
 * on Vercel, where `x-forwarded-for` is always present.
 */
async function resolveIdentifier(): Promise<string> {
  const headerList = await headers()

  const forwardedFor = headerList.get('x-forwarded-for')
  if (forwardedFor) {
    const first = forwardedFor.split(',')[0]?.trim()
    if (first) return first
  }

  const realIp = headerList.get('x-real-ip')
  if (realIp) return realIp

  return 'unknown'
}

/** `true` = proceed. Fails OPEN: a missing/erroring Redis logs and returns true. */
export async function checkRateLimit(kind: RateLimitKind, identifier?: string): Promise<boolean> {
  try {
    const url = process.env.UPSTASH_REDIS_REST_URL
    const token = process.env.UPSTASH_REDIS_REST_TOKEN

    if (!url || !token) {
      console.error(
        `[checkRateLimit] not configured — UPSTASH_REDIS_REST_URL and/or UPSTASH_REDIS_REST_TOKEN is unset (kind=${kind})`,
      )
      return true
    }

    const id = identifier ?? (await resolveIdentifier())
    const { limit, windowSeconds } = RATE_LIMITS[kind]

    const redis = new Redis({ url, token })
    const ratelimit = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(limit, `${windowSeconds} s`),
      prefix: `mse:${kind}`,
    })

    const result = await ratelimit.limit(id)
    if (typeof result?.success !== 'boolean') {
      console.error('[checkRateLimit] malformed limiter response — failing open', { kind })
      return true
    }
    return result.success
  } catch (error) {
    console.error(`[checkRateLimit] unexpected error (kind=${kind})`, error)
    return true
  }
}
