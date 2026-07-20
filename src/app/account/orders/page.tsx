import type { Metadata } from 'next'
import { AccountShell } from '@/features/account/components/account-shell'
import { OrderHistory } from '@/features/account/components/order-history'
import { requireUser } from '@/features/auth/guards'
import { getProfile } from '@/features/account/data'
import { MOCK_ORDERS } from '@/features/account/data/orders'

export const metadata: Metadata = {
  title: 'Your orders',
  description: 'View your MSE Lux order history.',
}

/**
 * Server-guarded by `requireUser()`. Orders themselves stay mock until Phase 5
 * builds the real order pipeline — `MOCK_ORDERS` is static seed data that is
 * NOT scoped to the signed-in user (Phase 2d already flagged that it carries
 * three different customers' names). The guard here means only *some*
 * authenticated user can reach it, not that the data belongs to them; that
 * gap closes when this read becomes a real per-user query.
 */
export default async function OrdersPage() {
  await requireUser()
  const profile = await getProfile()

  return (
    <AccountShell user={profile}>
      <OrderHistory orders={MOCK_ORDERS} />
    </AccountShell>
  )
}
