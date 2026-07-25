import type { Metadata } from 'next'
import { AccountShell } from '@/features/account/components/account-shell'
import { OrderHistory } from '@/features/account/components/order-history'
import { requireUser } from '@/features/auth/guards'
import { getProfile } from '@/features/account/data'
import { listOrders } from '@/features/account/data/orders'

export const metadata: Metadata = {
  title: 'Your orders',
  description: 'View your MSE Lux order history.',
}

/**
 * Server-guarded by `requireUser()`. `listOrders()` reads the signed-in
 * session user's real orders from the DB (scoped by `getCurrentUserId()`),
 * so this page only ever shows orders that belong to the current user.
 */
export default async function OrdersPage() {
  await requireUser()
  const [profile, orders] = await Promise.all([getProfile(), listOrders()])

  return (
    <AccountShell user={profile}>
      <OrderHistory orders={orders} />
    </AccountShell>
  )
}
