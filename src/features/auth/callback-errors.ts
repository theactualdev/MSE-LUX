/**
 * Maps `/auth/callback`'s `?error=` query-param values to the copy `/login`
 * shows in its shared `role="alert"` region.
 *
 * `/auth/callback` (`route.ts`) is the only writer of this param; this
 * module is the only reader. Kept as its own module (rather than living in
 * either file) so both can import the same fixed set of codes without a
 * server-route ↔ page-level circular dependency.
 *
 * Both messages are deliberately generic and non-enumerating: neither one
 * reveals whether an account exists for whatever address triggered the
 * failure. `recovery` additionally tells the visitor *what to do next*
 * (request a fresh link), because that's the one actionable distinction
 * worth surfacing — see `route.ts` for how `recovery` vs `auth` is decided
 * (from the *shape* of the request, specifically `next=/reset-password`,
 * never from anything that could differ based on whether the address is
 * real).
 */
export type CallbackErrorCode = 'auth' | 'recovery'

const CALLBACK_ERROR_MESSAGES: Record<CallbackErrorCode, string> = {
  recovery: 'This password reset link is no longer valid. Request a new one and try again.',
  auth: "We couldn't sign you in. Please try again.",
}

function isCallbackErrorCode(value: unknown): value is CallbackErrorCode {
  return value === 'auth' || value === 'recovery'
}

/**
 * Resolves a raw `error` search-param value (as read from a page's
 * `searchParams` prop — possibly absent, or an array if the param appears
 * more than once) to display copy, or `undefined` when there's nothing to
 * show. Unrecognized values resolve to `undefined` rather than falling back
 * to the generic message, so a mistyped or unrelated `?error=` on `/login`
 * never surfaces alert text that nothing actually produced.
 */
export function callbackErrorMessage(value: string | string[] | undefined): string | undefined {
  const code = Array.isArray(value) ? value[0] : value
  return isCallbackErrorCode(code) ? CALLBACK_ERROR_MESSAGES[code] : undefined
}
