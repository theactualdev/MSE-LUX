import type { Metadata } from 'next'
import { Container } from '@/components/brand/container'
import { OrderConfirmation } from '@/features/checkout/components/order-confirmation'

interface OrderConfirmationPageProps {
  params: Promise<{ orderNumber: string }>
}

export const metadata: Metadata = {
  title: 'Order confirmed',
}

export default async function OrderConfirmationPage({ params }: OrderConfirmationPageProps) {
  const { orderNumber } = await params

  return (
    <Container className="flex flex-col gap-8 py-12 sm:py-16">
      <OrderConfirmation orderNumber={orderNumber} />
    </Container>
  )
}
