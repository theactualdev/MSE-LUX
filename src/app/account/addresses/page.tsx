import type { Metadata } from 'next'
import { AccountShell } from '@/features/account/components/account-shell'
import { AddressBook } from '@/features/account/components/address-book'
import { RequireAuth } from '@/features/account/components/require-auth'

export const metadata: Metadata = {
  title: 'Saved addresses',
  description: 'Manage your saved MSE Lux delivery addresses.',
}

export default function AddressesPage() {
  return (
    <RequireAuth>
      <AccountShell>
        <AddressBook />
      </AccountShell>
    </RequireAuth>
  )
}
