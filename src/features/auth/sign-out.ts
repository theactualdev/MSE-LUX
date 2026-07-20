'use client'

import { signOut } from '@/features/auth/actions'

/**
 * Shared sign-out handler for the account sidebar (`AccountShell`) and the
 * header dropdown (`AccountMenu`).
 *
 * This replaces the former `useSignOut` hook, which existed almost entirely
 * to coordinate the real sign-out with the mock `useAuthStore`: it cleared
 * the persisted mock user synchronously, restored it if the action came back
 * with `{ error }`, and set a module-level `isSignOutInFlight()` flag that
 * `RequireAuth` read to suppress its own `/login` redirect. That whole
 * apparatus was load-bearing only because two *client-side* pieces of state
 * disagreed about whether the user was signed in.
 *
 * Task 8 removed both: there is no mock store to clear or restore, and
 * `RequireAuth` is gone (account routes are enforced server-side by
 * `requireUser()` now), so nothing dispatches a competing navigation for the
 * in-flight flag to suppress. What's left is the part that was always doing
 * the real work — the `signOut()` Server Action, whose `redirect('/')` is the
 * single source of truth for where sign-out lands. No client-side navigation
 * is issued here, deliberately: Next's `dispatchAction` gives any navigation
 * priority over a pending action and marks that action discarded, so a
 * client-side `push`/`replace` alongside this call would drop the action's
 * own redirect — the exact bug the old flag was working around.
 *
 * Not a hook any more (it uses none), so it's a plain function callers can
 * pass straight to `onClick`.
 */
export function handleSignOut(): void {
  void signOut().catch(() => {
    // Reached for the expected redirect-as-rejection — a successful
    // `signOut()` never resolves on the client, it rejects with an internal
    // NEXT_REDIRECT that Next's router has already acted on (verified
    // empirically against the dev server in Task 5) — and for a genuine
    // transport failure (offline, 500). Neither has error-surfacing UI at
    // these two call sites, and swallowing here is what keeps the expected
    // case from becoming an unhandled rejection.
  })
}
