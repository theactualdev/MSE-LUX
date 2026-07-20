import 'server-only'

import { redirect } from 'next/navigation'
import { getSessionClaims } from '@/features/auth/claims'

/**
 * Server-side counterpart to the deleted `RedirectIfAuthed` Client Component:
 * bounces an already-signed-in visitor away from an auth-only page (login,
 * signup, forgot-password) to `/account`.
 *
 * Why this replaced the client component, rather than just being added
 * alongside it: the old one read the mock `useAuthStore`, whose persisted
 * `mselux-auth` user could outlive the real Supabase session. That produced a
 * concrete bug — `updatePassword` calls `signOut({ scope: 'global' })` and
 * then `redirect('/login')`, but nothing cleared the persisted mock user, so
 * `RedirectIfAuthed` would bounce that redirect straight back to `/account`
 * and render a signed-in dashboard shell over a session that no longer
 * existed. Deriving the answer from verified JWT claims on the server instead
 * makes that class of divergence impossible: there is only one source of
 * truth left, and it is the one the server enforces with.
 *
 * `redirect()` throws by design (return type `never`) — never wrap a call to
 * this in a try/catch.
 *
 * Deliberately NOT used on `/reset-password`: Supabase's recovery link
 * establishes a session before the user lands there, so a signed-in visitor is
 * the expected case and redirecting would make the reset flow unreachable by
 * construction. See `reset-password/page.tsx` and `hasRecentRecoveryAuth`.
 */
export async function redirectIfAuthenticated(): Promise<void> {
  const claims = await getSessionClaims()

  if (claims) {
    redirect('/account')
  }
}
