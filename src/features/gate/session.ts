/**
 * The site-gate session token: what the `mse_gate` cookie holds after a
 * visitor enters the launch password, and how the proxy verifies it.
 *
 * Shape: `v1.<expiryMs>.<base64url HMAC-SHA256>`, signed over the version and
 * expiry with `SITE_PASSWORD` as the key. Three properties fall out of that:
 *
 * - The cookie never contains the password (only an expiry and a MAC).
 * - Forging one requires the password itself — there is no second secret to
 *   leak or rotate independently.
 * - Changing `SITE_PASSWORD` instantly revokes every existing session, which
 *   is exactly what the owner wants when the password escapes: rotate the env
 *   var, redeploy, everyone re-enters.
 *
 * WEB CRYPTO ONLY, no `node:crypto` and no `Buffer`: this module runs in the
 * proxy (whose runtime Next controls, not us), in server actions (Node), and
 * under Vitest. `globalThis.crypto.subtle` is the one API present in all
 * three. Verification uses `crypto.subtle.verify`, which performs the
 * comparison itself — never a `===` on MAC strings.
 *
 * NOT tied into Supabase auth on purpose: the customer gate is a launch
 * curtain over the whole storefront, orthogonal to who is signed in. Admin
 * authentication (Supabase session + `requireRole(ADMIN)` + per-action role
 * re-checks) is a separate, stronger system and the proxy exempts `/admin`
 * from this gate entirely.
 */

export const GATE_COOKIE = 'mse_gate'

/** 30 days — long enough that testers and the owner are not re-typing the password weekly. */
export const GATE_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30

const VERSION = 'v1'

const encoder = new TextEncoder()

async function importKey(password: string, usage: 'sign' | 'verify'): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', encoder.encode(password), { name: 'HMAC', hash: 'SHA-256' }, false, [usage])
}

function toBase64Url(bytes: ArrayBuffer): string {
  let binary = ''
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(value: string): ArrayBuffer | null {
  try {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/')
    const binary = atob(padded)
    const buffer = new ArrayBuffer(binary.length)
    const bytes = new Uint8Array(buffer)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return buffer
  } catch {
    return null
  }
}

/**
 * The signed payload — version + expiry, so neither can be swapped
 * independently of the MAC. Returned as a plain `ArrayBuffer`: TS 5.9 types
 * `TextEncoder.encode` as `Uint8Array<ArrayBufferLike>`, which no longer
 * satisfies `BufferSource`, so the bytes are copied into a fresh buffer.
 */
function payload(expiresAtMs: number): ArrayBuffer {
  const bytes = encoder.encode(`${VERSION}.${expiresAtMs}`)
  const buffer = new ArrayBuffer(bytes.length)
  new Uint8Array(buffer).set(bytes)
  return buffer
}

/** Mints a gate session token expiring `GATE_SESSION_MAX_AGE_SECONDS` from now. */
export async function mintGateToken(password: string, now: number = Date.now()): Promise<string> {
  const expiresAtMs = now + GATE_SESSION_MAX_AGE_SECONDS * 1000
  const key = await importKey(password, 'sign')
  const signature = await crypto.subtle.sign('HMAC', key, payload(expiresAtMs))
  return `${VERSION}.${expiresAtMs}.${toBase64Url(signature)}`
}

/**
 * True only for a well-formed, unexpired token whose MAC verifies under the
 * CURRENT password. Never throws — a malformed cookie is just "not
 * authenticated", the same as no cookie at all.
 */
export async function verifyGateToken(
  token: string | undefined,
  password: string,
  now: number = Date.now(),
): Promise<boolean> {
  if (!token) return false

  const parts = token.split('.')
  if (parts.length !== 3 || parts[0] !== VERSION) return false

  const expiresAtMs = Number(parts[1])
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= now) return false

  const signature = fromBase64Url(parts[2])
  if (!signature || signature.byteLength === 0) return false

  try {
    const key = await importKey(password, 'verify')
    return await crypto.subtle.verify('HMAC', key, signature, payload(expiresAtMs))
  } catch {
    return false
  }
}
