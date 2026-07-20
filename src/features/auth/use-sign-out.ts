import { useAuthStore } from '@/features/account/store'
import { signOut } from '@/features/auth/actions'

/**
 * Plain module-level flag (not a store) that `RequireAuth` reads to skip its
 * own `/login` redirect while a sign-out is in flight. See `useSignOut`
 * below for why the redirect needs to be skipped at all, and why this is a
 * flag read imperatively inside an effect rather than a reactive dependency:
 * `RequireAuth`'s effect only consults `isSignOutInFlight()` at the moment
 * it actually *runs* (triggered by `hydrated`/`user`/`router` changing), so
 * flipping this back to `false` once `signOut()` settles can never itself
 * retrigger that effect. That matters because Next applies a server action's
 * `redirect()` to the router's internal state independently of when (or
 * whether) the action's own client-side promise settles — see the "Fix pass
 * 4" section of task-5-report.md for the source trace. If this flag were
 * instead a dependency of the effect, resetting it the moment `signOut()`
 * settles could race Next's own application of `redirect('/')` and
 * reintroduce a second, competing `/login` navigation — exactly the bug this
 * flag exists to prevent. The trade-off: on the rare path where `signOut()`
 * fails at the transport level (offline, 500 — see the `.catch()` below),
 * nothing proactively re-triggers `RequireAuth`'s effect after the flag
 * resets, so a visitor stuck on that blank screen needs to navigate away
 * manually (e.g. via the header, which is unaffected) rather than being
 * auto-bounced to `/login`. Noted rather than hidden, matching this file's
 * sibling trade-off in `require-auth.tsx`.
 */
let signOutInFlight = false

export function isSignOutInFlight() {
  return signOutInFlight
}

/**
 * Shared sign-out handler for the account sidebar (`AccountShell`) and the
 * header dropdown (`AccountMenu`) — both call sites were byte-identical, so
 * the reasoning below now lives in exactly one place.
 *
 * Why sign-out landed on `/login` instead of `/` for three previous fix
 * passes, and why this shape finally breaks it: `signOut()`'s server action
 * calls `redirect('/')` on success, which is the single source of truth for
 * the destination — no client-side navigation is issued here. The problem
 * was never *this* function's own logic (already correct since "Fix pass
 * 3": clear the mock store synchronously, restore it only if the action
 * resolves with `{ error }`, swallow the redirect-as-rejection in `.catch()`
 * — see that pass's write-up for why). The problem was `RequireAuth`: every
 * sign-out click happens on an `/account*` page, so the synchronous
 * `clearMockSession()` call below immediately re-renders `RequireAuth` with
 * `user === null`, firing *its* `router.replace('/login')` effect while
 * `signOut()`'s server action is still in flight. Next.js's action queue
 * gives navigations priority over pending actions unconditionally
 * (`node_modules/next/dist/client/components/app-router-instance.js`,
 * `dispatchAction`, ~lines 143-149) — including over an *already-settled*
 * pending action whose result just hasn't been applied to router state yet
 * — so `RequireAuth`'s `/login` navigation always discarded `signOut()`'s
 * `/` redirect before it could be applied. Reordering *when* the mock store
 * gets cleared (all three previous passes) never touched this, because the
 * competing navigation is dispatched by `RequireAuth`'s effect, not by
 * anything here.
 *
 * The fix: set `signOutInFlight` before clearing the mock store, so
 * `RequireAuth`'s effect skips its own navigation for the duration of this
 * call. With no competing `/login` navigation ever dispatched,
 * `signOut()`'s own action is never discarded, so Next applies its
 * `redirect('/')` normally — no explicit client-side navigation needed here
 * at all.
 */
export function useSignOut() {
  const user = useAuthStore((s) => s.user)
  const clearMockSession = useAuthStore((s) => s.signOut)

  return () => {
    signOutInFlight = true
    // Transitional: the mock store's `signOut` still owns `user` in
    // localStorage until Task 8 retires the store. Without clearing it
    // here, the stale mock `user` would keep `AccountShell`/`AccountMenu`
    // (and `RedirectIfAuthed`) believing the visitor is signed in after a
    // real sign-out. Cleared synchronously (optimistically assuming
    // success) and restored only if the action resolves with `{ error }` —
    // the one outcome that genuinely resolves; a successful `signOut()`
    // never resolves on the client, it rejects with an internal
    // NEXT_REDIRECT error instead (verified empirically against the real
    // dev server in "Fix pass 3" — see task-5-report.md).
    clearMockSession()
    void signOut()
      .then((result) => {
        if (result?.error) {
          // Supabase reported a real error — the session cookie is still
          // live, so put the mock user back and re-enable RequireAuth's
          // guard rather than presenting a signed-out UI over a signed-in
          // session.
          useAuthStore.setState({ user })
        }
        signOutInFlight = false
      })
      .catch(() => {
        // Reached for the expected redirect-as-rejection (a successful
        // signOut()'s server-side redirect('/') turns into a rejected
        // client promise, already handled by Next's router — see "Fix pass
        // 3") and for a genuine transport failure (offline, 500). Neither
        // has an error-surfacing UI here, and a transport failure gives no
        // reliable signal the session is still valid, so the store is left
        // as the synchronous clear above left it rather than guessing.
        signOutInFlight = false
      })
  }
}
