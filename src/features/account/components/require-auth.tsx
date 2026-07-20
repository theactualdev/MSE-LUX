'use client'

import { useEffect, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useHydrated } from '@/features/cart/use-hydrated'
import { useAuthStore } from '@/features/account/store'
import { isSignOutInFlight } from '@/features/auth/use-sign-out'

interface RequireAuthProps {
  children: ReactNode
}

/**
 * Guards account-only routes against a signed-out visitor. Renders a neutral
 * skeleton until the client has hydrated (avoiding a server/client mismatch
 * on persisted auth state); once hydrated, redirects a signed-out user to
 * `/login` and otherwise renders `children`.
 *
 * Skips that redirect while `isSignOutInFlight()` is true. `useSignOut`
 * clears the mock store synchronously, which re-renders this component with
 * `user === null` well before its `signOut()` server action settles; without
 * this guard, this effect would fire its own `/login` navigation and win the
 * race against `signOut()`'s `redirect('/')` every time (see
 * `use-sign-out.ts` and task-5-report.md "Fix pass 4" for the full trace).
 */
export function RequireAuth({ children }: RequireAuthProps) {
  const hydrated = useHydrated()
  const user = useAuthStore((s) => s.user)
  const router = useRouter()

  useEffect(() => {
    if (hydrated && !user && !isSignOutInFlight()) router.replace('/login')
  }, [hydrated, user, router])

  if (!hydrated) {
    return <div aria-hidden className="mx-auto h-64 w-full max-w-md animate-pulse rounded-xl bg-muted" />
  }

  if (!user) return null

  return <>{children}</>
}
