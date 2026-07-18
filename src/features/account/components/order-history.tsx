import { OrderRow } from '@/features/account/components/order-row'
import type { Order } from '@/features/checkout/lib/place-order'

interface OrderHistoryProps {
  orders: Order[]
}

/** Lists the signed-in customer's past orders, most recent first as passed in, or a strong empty state. */
export function OrderHistory({ orders }: OrderHistoryProps) {
  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-16 text-center">
        <h2 className="font-display text-lg font-semibold text-foreground">No orders yet</h2>
        <p className="max-w-sm text-sm text-muted-foreground">
          When you place an order, it will show up here so you can track it any time.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {orders.map((order) => (
        <OrderRow key={order.orderNumber} order={order} />
      ))}
    </div>
  )
}
