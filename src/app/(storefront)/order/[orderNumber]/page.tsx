import type { Metadata } from 'next'
import { Container } from '@/components/brand/container'
import { OrderConfirmation } from '@/features/checkout/components/order-confirmation'
import { getOrder } from '@/features/account/data/orders'

interface OrderConfirmationPageProps {
  params: Promise<{ orderNumber: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export const metadata: Metadata = {
  title: 'Order confirmed',
}

/**
 * `getOrder` returns `null` for a guest (no session) or a not-owned order —
 * no error, no throw — so a signed-in owner's confirmation reads the DB
 * (survives a reload) while a guest's stays snapshot-only (no public read by
 * raw order number).
 *
 * `?status=processing` is the one-shot flag `checkout-flow.tsx` appends to
 * this route's own navigation when `verifyPayment` resolved `'processing'`
 * (Phase 6 finding B) — read here (never from `initialOrder`/the session
 * snapshot, neither of which carry a fulfilment status to gate on) and
 * handed down as `paymentStatus`. Any other value, or a reload/direct visit
 * with no query at all, falls back to `OrderConfirmation`'s own `'paid'`
 * default.
 */
export default async function OrderConfirmationPage({ params, searchParams }: OrderConfirmationPageProps) {
  const { orderNumber } = await params
  const { status } = await searchParams
  const order = await getOrder(orderNumber)

  return (
    <Container className="flex flex-col gap-8 py-12 sm:py-16">
      <OrderConfirmation
        orderNumber={orderNumber}
        initialOrder={order ?? undefined}
        paymentStatus={status === 'processing' ? 'processing' : 'paid'}
      />
    </Container>
  )
}
