import type { Metadata } from 'next'
import { Container } from '@/components/brand/container'
import { OrderConfirmation } from '@/features/checkout/components/order-confirmation'
import { getOrder } from '@/features/account/data/orders'

interface OrderConfirmationPageProps {
  params: Promise<{ orderNumber: string }>
}

export const metadata: Metadata = {
  title: 'Order confirmed',
}

/**
 * `getOrder` returns `null` for a guest (no session) or a not-owned order —
 * no error, no throw — so a signed-in owner's confirmation reads the DB
 * (survives a reload) while a guest's stays snapshot-only (no public read by
 * raw order number).
 */
export default async function OrderConfirmationPage({ params }: OrderConfirmationPageProps) {
  const { orderNumber } = await params
  const order = await getOrder(orderNumber)

  return (
    <Container className="flex flex-col gap-8 py-12 sm:py-16">
      <OrderConfirmation orderNumber={orderNumber} initialOrder={order ?? undefined} />
    </Container>
  )
}
