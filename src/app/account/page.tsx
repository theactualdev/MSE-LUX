import type { Metadata } from 'next'
import { AccountShell } from '@/features/account/components/account-shell'
import { ProfileForm } from '@/features/account/components/profile-form'
import { RequireAuth } from '@/features/account/components/require-auth'

export const metadata: Metadata = {
  title: 'Your account',
  description: 'View and update your MSE Lux account profile.',
}

export default function AccountPage() {
  return (
    <RequireAuth>
      <AccountShell>
        <ProfileForm />
      </AccountShell>
    </RequireAuth>
  )
}
