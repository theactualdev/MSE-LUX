'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { roleFromClaims } from '@/features/auth/role'
import { Role } from '@/generated/prisma/enums'

export interface ClientSessionState {
  /** True once a session has been observed. UX only — never an authorization decision. */
  signedIn: boolean
  /**
   * The role claimed by the browser's session cookie, defaulting to
   * `CUSTOMER`. UX only, exactly like `signedIn` — see the security note on
   * the hook below before using it for anything.
   */
  role: Role
  /** True until the first read settles, so callers can render an inert placeholder instead of guessing. */
  loading: boolean
}

/**
 * Whether the browser currently holds a Supabase session, for header/nav
 * affordances only.
 *
 * SECURITY: this is **not** an authorization boundary and must never be used
 * as one. It reads the auth cookie from the browser, where the user can
 * tamper with it freely; every protected route enforces access server-side
 * via `requireUser()` (`src/features/auth/guards.ts`), which verifies the JWT
 * signature through `getClaims()`. The worst a forged value here can do is
 * render a dropdown whose links all bounce to `/login`.
 *
 * SECURITY (`role`): the same caveat, and it matters more because `role`
 * *looks* like a permission. It is not one. Forging `app_metadata.role` in
 * the cookie reveals the Admin menu item and nothing else: `admin/layout.tsx`
 * calls `requireRole(ADMIN)` and every admin Server Action re-checks the role
 * independently, both against a signature-verified JWT. The entire prize for
 * tampering is learning that `/admin` exists — which is why the item is
 * hidden by default (the route `notFound()`s rather than 403s, deliberately
 * concealing it), but not why it would be dangerous to show. Never gate
 * anything but rendering on this value.
 *
 * Replaces the mock `useAuthStore` this hook retired. It deliberately does
 * *not* re-introduce a client-side store: `@supabase/ssr` keeps the session in
 * cookies shared with the server, so the cookie is already the single source
 * of truth and a second copy in React state would just be one more thing to
 * go stale.
 *
 * Why the state is read on both an event *and* a navigation:
 *
 * - `onAuthStateChange` fires `INITIAL_SESSION` on mount and covers anything
 *   that happens through the *browser* client. But this app signs in and out
 *   through **Server Actions** (`signIn`, `signOut` in
 *   `@/features/auth/actions`), which mutate the cookie from Node. The
 *   browser's GoTrue instance has no way to observe that, so the event alone
 *   would leave the header showing "Sign in" after a successful login, and an
 *   account dropdown after a sign-out.
 * - Re-reading on `pathname` change closes exactly that gap, because every
 *   server-driven auth change in this app is immediately followed by a
 *   navigation: `signIn` → `router.push('/account')`, `signOut` →
 *   `redirect('/')`, the OAuth callback → a full page load.
 *
 * The re-read is cheap and, importantly, correct: `getClaims()` goes through
 * GoTrue's `__loadSession`, which reads the storage adapter (here, cookies)
 * on **every** call rather than serving a cached in-memory session — verified
 * against `node_modules/@supabase/auth-js/dist/module/GoTrueClient.js`. A
 * memoised read would have made the pathname re-check useless.
 */
export function useSession(): ClientSessionState {
  const pathname = usePathname()
  const [state, setState] = useState<ClientSessionState>({
    signedIn: false,
    role: Role.CUSTOMER,
    loading: true,
  })

  useEffect(() => {
    const supabase = createClient()
    // Guards against a state update after unmount, and against a slow read
    // resolving on top of a newer one.
    let active = true

    function settle(signedIn: boolean, role: Role = Role.CUSTOMER) {
      if (active) setState({ signedIn, role, loading: false })
    }

    supabase.auth
      .getClaims()
      .then(({ data }) => settle(Boolean(data?.claims), roleFromClaims(data?.claims)))
      // A verification failure (tampered or expired-beyond-refresh cookie) is
      // "not signed in" for display purposes, not an error worth surfacing.
      .catch(() => settle(false))

    // `onAuthStateChange` hands back a Session, not decoded claims. Its
    // `user.app_metadata` is the same object the JWT carries, so the role is
    // read from there rather than left stale at the previous value.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) =>
      // Narrowed to the one field `roleFromClaims` reads: Supabase's `User`
      // type has no index signature, so it doesn't satisfy `ClaimsLike`
      // structurally even though `app_metadata` is the same object.
      //
      // `session.user` is optional-chained rather than assumed: this callback
      // runs inside the auth listener, so throwing here would leave the header
      // permanently stale. A session without a user degrades to CUSTOMER,
      // matching `roleFromClaims`'s own "never trust a malformed claim" rule.
      settle(Boolean(session), roleFromClaims(session?.user ? { app_metadata: session.user.app_metadata } : null)),
    )

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [pathname])

  return state
}
