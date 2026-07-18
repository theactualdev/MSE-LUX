'use client'

import { useEffect, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useHydrated } from '@/features/cart/use-hydrated'
import { useAuthStore } from '@/features/account/store'

interface RequireAuthProps {
  children: ReactNode
}

/**
 * Guards account-only routes against a signed-out visitor. Renders a neutral
 * skeleton until the client has hydrated (avoiding a server/client mismatch
 * on persisted auth state); once hydrated, redirects a signed-out user to
 * `/login` and otherwise renders `children`.
 */
export function RequireAuth({ children }: RequireAuthProps) {
  const hydrated = useHydrated()
  const user = useAuthStore((s) => s.user)
  const router = useRouter()

  useEffect(() => {
    if (hydrated && !user) router.replace('/login')
  }, [hydrated, user, router])

  if (!hydrated) {
    return <div aria-hidden className="mx-auto h-64 w-full max-w-md animate-pulse rounded-xl bg-muted" />
  }

  if (!user) return null

  return <>{children}</>
}
