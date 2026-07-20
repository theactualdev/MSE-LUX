/**
 * Fixed, non-existent origin used purely as a resolution anchor — see
 * `isSafeRedirectPath` below. Never dereferenced over the network.
 */
const SAFE_RESOLUTION_BASE = 'http://safe-redirect-check.internal'

/** Matches ASCII control characters (C0 set plus DEL) via hex escapes — see the comment below for why these matter. */
const CONTROL_CHARACTER_PATTERN = new RegExp('[\\x00-\\x1f\\x7f]')

/**
 * True when `value` is safe to hand to `NextResponse.redirect()` as the
 * `next` destination for `/auth/callback` — i.e. a same-origin relative
 * path, never an absolute URL or a protocol-relative one.
 *
 * This is the open-redirect guard for the callback route: an attacker who
 * controls the `next` query param (e.g.
 * `/auth/callback?code=...&next=https://evil.example/phish`) could
 * otherwise get a freshly-authenticated Supabase session — complete with
 * its session cookie already set on this response — redirected straight to
 * a look-alike site of their choosing.
 *
 * A naive `value.startsWith('/')` check is not enough:
 * - `//evil.com` starts with a single `/` yet browsers resolve it as
 *   protocol-relative (scheme inherited from the current page), landing on
 *   `evil.com`.
 * - `/\evil.com` behaves identically — the WHATWG URL spec normalises a
 *   leading backslash the same as a forward slash for special schemes
 *   (http/https), so this is `//evil.com` in disguise even though it
 *   doesn't visually look like one.
 * - Absolute URLs with their own scheme (`https://evil.example`,
 *   `javascript:alert(1)`) don't start with `/` at all, but a check that
 *   only inspects the first character and stops there is fragile by
 *   construction.
 *
 * Two layers, deliberately redundant:
 * 1. Explicit checks for the exact shapes above — reject-and-fall-back,
 *    documenting intent for anyone reading this later.
 * 2. `new URL(value, SAFE_RESOLUTION_BASE)` and a comparison of the
 *    resolved `origin` back to `SAFE_RESOLUTION_BASE`. This is the actual
 *    backstop: it independently catches every case above (the WHATWG URL
 *    parser performs the same backslash/protocol-relative normalisation
 *    browsers do, and also strips tab/newline/CR before parsing, so
 *    `"/\t/evil.com"` — control-character smuggling of a `//` — resolves to
 *    a different origin too) plus anything the explicit checks don't
 *    anticipate. Empirically verified against Node's URL implementation
 *    (WHATWG-compliant, same parser class as browsers) for every case this
 *    module's tests exercise.
 *
 * `value` is expected already-decoded (as returned by
 * `URLSearchParams.get()`/`NextRequest`'s `searchParams`), which decodes
 * percent-escapes exactly once — matching what a browser does when it reads
 * the query string off the address bar.
 */
export function isSafeRedirectPath(value: string | null | undefined): value is string {
  if (!value) return false

  // Control characters (tab, newline, CR, and other C0/DEL controls) are
  // stripped by browsers before a URL is resolved, so reject them outright
  // rather than let e.g. "/\t/evil.com" sneak past the checks below in the
  // guise of an innocuous path.
  if (CONTROL_CHARACTER_PATTERN.test(value)) return false

  // Must be single-slash-rooted: not empty, and not "//..." or "/\..."
  // (protocol-relative). No backslash anywhere — WHATWG treats `\` as `/`
  // when resolving a URL against a special (http/https) scheme, so a
  // backslash anywhere later in the string could still flip the parse.
  if (value[0] !== '/') return false
  if (value[1] === '/' || value[1] === '\\') return false
  if (value.includes('\\')) return false

  try {
    const resolved = new URL(value, SAFE_RESOLUTION_BASE)
    return resolved.origin === SAFE_RESOLUTION_BASE
  } catch {
    return false
  }
}
