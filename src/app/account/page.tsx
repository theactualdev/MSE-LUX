import type { Metadata } from 'next'
import { AccountShell } from '@/features/account/components/account-shell'
import { ProfileForm } from '@/features/account/components/profile-form'
import { requireUser } from '@/features/auth/guards'
import { getProfile } from '@/features/account/data'

export const metadata: Metadata = {
  title: 'Your account',
  description: 'View and update your MSE Lux account profile.',
}

/**
 * `requireUser()` is the security boundary for this route: it verifies the JWT
 * via `getClaims()` and redirects to `/login` when there is no session, before
 * any data is read or any markup is produced. The former client-side
 * `RequireAuth` wrapper is gone — a component that hides children after
 * hydration never actually stopped the server from rendering and shipping
 * them in the first place.
 *
 * `getProfile()` resolves the user id from the session itself, so there is no
 * id parameter here to get wrong.
 */
export default async function AccountPage() {
  await requireUser()
  const profile = await getProfile()

  return (
    <AccountShell user={profile}>
      <ProfileForm
        // Defensive fallback: Task 2's trigger provisions a Profile for every
        // signup, so an authenticated user effectively always has a row — but
        // one created out-of-band wouldn't, and an empty form beats a crash
        // on a property access.
        defaultValues={{
          name: profile?.name ?? '',
          email: profile?.email ?? '',
          phone: profile?.phone ?? '',
        }}
      />
    </AccountShell>
  )
}
