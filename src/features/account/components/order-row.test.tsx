import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { OrderRow } from '@/features/account/components/order-row'
import { formatMoney } from '@/lib/money'
import type { OrderView } from '@/features/checkout/lib/order-view'

const ORDER: OrderView = {
  orderNumber: 'MSE-100200',
  email: 'ada@example.com',
  address: {
    fullName: 'Ada Lovelace',
    phone: '0800 000 0000',
    line1: '12 Marina Road',
    city: 'Lagos',
    state: 'Lagos',
    country: 'Nigeria',
  },
  shippingLabel: 'Lagos Express',
  lines: [
    {
      name: 'Solitaire Ring',
      image: { src: '/ring.jpg', alt: 'Solitaire Ring' },
      quantity: 2,
      unitPrice: { amountMinor: 500000, currency: 'NGN' },
      lineTotal: { amountMinor: 1000000, currency: 'NGN' },
    },
  ],
  summary: {
    subtotal: { amountMinor: 1000000, currency: 'NGN' },
    shipping: { amountMinor: 300000, currency: 'NGN' },
    tax: { amountMinor: 75000, currency: 'NGN' },
    total: { amountMinor: 1375000, currency: 'NGN' },
  },
  placedAt: '2026-06-01T10:00:00.000Z',
  status: 'SHIPPED',
}

describe('OrderRow', () => {
  it('renders the order number, formatted total, and a title-cased status badge', () => {
    render(<OrderRow order={ORDER} />)

    expect(screen.getByText('MSE-100200')).toBeInTheDocument()
    expect(screen.getByText('Shipped')).toBeInTheDocument()
    expect(screen.getByText(formatMoney(ORDER.summary.total))).toBeInTheDocument()
  })
})
