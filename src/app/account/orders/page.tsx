import type { Metadata } from 'next'
import { AccountShell } from '@/features/account/components/account-shell'
import { OrderHistory } from '@/features/account/components/order-history'
import { RequireAuth } from '@/features/account/components/require-auth'
import { MOCK_ORDERS } from '@/features/account/data/orders'

export const metadata: Metadata = {
  title: 'Your orders',
  description: 'View your MSE Lux order history.',
}

export default function OrdersPage() {
  return (
    <RequireAuth>
      <AccountShell>
        <OrderHistory orders={MOCK_ORDERS} />
      </AccountShell>
    </RequireAuth>
  )
}
