'use client'

import { useEffect, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useHydrated } from '@/features/cart/use-hydrated'
import { useAuthStore } from '@/features/account/store'

interface RedirectIfAuthedProps {
  children: ReactNode
}

/**
 * Guards auth-only routes (login, signup, ...) against an already-signed-in
 * user. Renders a neutral skeleton until the client has hydrated (avoiding a
 * server/client mismatch on persisted auth state); once hydrated, redirects
 * a signed-in user to `/account` and otherwise renders `children`.
 */
export function RedirectIfAuthed({ children }: RedirectIfAuthedProps) {
  const hydrated = useHydrated()
  const user = useAuthStore((s) => s.user)
  const router = useRouter()

  useEffect(() => {
    if (hydrated && user) router.replace('/account')
  }, [hydrated, user, router])

  if (!hydrated) {
    return <div aria-hidden className="mx-auto h-64 w-full max-w-md animate-pulse rounded-xl bg-muted" />
  }

  if (user) return null

  return <>{children}</>
}
