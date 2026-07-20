import type { Metadata } from 'next'
import { AccountShell } from '@/features/account/components/account-shell'
import { AddressBook } from '@/features/account/components/address-book'
import { requireUser } from '@/features/auth/guards'
import { getProfile, listAddresses } from '@/features/account/data'

export const metadata: Metadata = {
  title: 'Saved addresses',
  description: 'Manage your saved MSE Lux delivery addresses.',
}

/** Server-guarded by `requireUser()`; both reads scope themselves to the session user. */
export default async function AddressesPage() {
  await requireUser()
  const [profile, addresses] = await Promise.all([getProfile(), listAddresses()])

  return (
    <AccountShell user={profile}>
      <AddressBook addresses={addresses} />
    </AccountShell>
  )
}
