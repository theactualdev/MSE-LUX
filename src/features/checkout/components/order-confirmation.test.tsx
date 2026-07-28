import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { OrderConfirmation } from '@/features/checkout/components/order-confirmation'
import { useLastOrderStore } from '@/features/checkout/store'
import type { Order } from '@/features/checkout/lib/place-order'

function buildOrder(overrides: Partial<Order> = {}): Order {
  return {
    orderNumber: 'MSE-100001',
    email: 'jane@example.com',
    address: {
      fullName: 'Jane Doe',
      phone: '+1 555 123 4567',
      line1: '123 Main St',
      city: 'New York',
      state: 'NY',
      country: 'US',
      postalCode: '10001',
    },
    shippingLabel: 'Standard Shipping',
    lines: [
      {
        name: 'Gold Hoop Earrings',
        image: { src: '/gold-hoops.jpg', alt: 'Gold Hoop Earrings' },
        quantity: 1,
        unitPrice: { amountMinor: 2900, currency: 'USD' },
        lineTotal: { amountMinor: 2900, currency: 'USD' },
      },
    ],
    summary: {
      subtotal: { amountMinor: 2900, currency: 'USD' },
      shipping: { amountMinor: 500, currency: 'USD' },
      tax: { amountMinor: 232, currency: 'USD' },
      total: { amountMinor: 3632, currency: 'USD' },
    },
    placedAt: '2026-07-24T10:00:00.000Z',
    ...overrides,
  }
}

describe('OrderConfirmation', () => {
  beforeEach(() => {
    useLastOrderStore.getState().clear()
  })

  it('renders from initialOrder immediately, without any session snapshot', () => {
    const order = buildOrder({ orderNumber: 'MSE-100001' })

    render(<OrderConfirmation orderNumber="MSE-100001" initialOrder={order} />)

    expect(useLastOrderStore.getState().order).toBeNull()
    expect(screen.getByText('MSE-100001')).toBeInTheDocument()
    expect(screen.getByText('Gold Hoop Earrings')).toBeInTheDocument()
    expect(screen.getByText('$36.32')).toBeInTheDocument()
  })

  it('falls back to the session snapshot when initialOrder is absent', async () => {
    const order = buildOrder({ orderNumber: 'MSE-200002' })
    useLastOrderStore.getState().setOrder(order)

    render(<OrderConfirmation orderNumber="MSE-200002" />)

    expect(await screen.findByText('MSE-200002')).toBeInTheDocument()
    expect(screen.getByText('Gold Hoop Earrings')).toBeInTheDocument()
  })

  it('shows not-found when initialOrder is absent and the snapshot is missing or mismatched', async () => {
    const order = buildOrder({ orderNumber: 'MSE-300003' })
    useLastOrderStore.getState().setOrder(order)

    render(<OrderConfirmation orderNumber="MSE-999999" />)

    expect(await screen.findByText(/couldn.t find that order/i)).toBeInTheDocument()
  })

  describe('paymentStatus (Phase 6 finding B)', () => {
    // `paymentStatus` is threaded down from the page's `?status=` query flag
    // — never inferred from `initialOrder`/the snapshot, neither of which
    // carry a fulfilment status to gate on (see order-confirmation.tsx).

    it('defaults to the normal confirmed state when paymentStatus is omitted, with initialOrder', () => {
      const order = buildOrder({ orderNumber: 'MSE-100001' })

      render(<OrderConfirmation orderNumber="MSE-100001" initialOrder={order} />)

      expect(screen.getByText('Thank you for your order')).toBeInTheDocument()
      expect(screen.queryByText(/finalising your order/i)).not.toBeInTheDocument()
    })

    it('renders the distinct "finalising" state when paymentStatus is "processing", with initialOrder', () => {
      const order = buildOrder({ orderNumber: 'MSE-100001' })

      render(<OrderConfirmation orderNumber="MSE-100001" initialOrder={order} paymentStatus="processing" />)

      expect(screen.getByText(/payment received.*finalising your order/i)).toBeInTheDocument()
      expect(screen.queryByText('Thank you for your order')).not.toBeInTheDocument()
      // The rest of the order (address, lines, totals) still renders unchanged.
      expect(screen.getByText('Gold Hoop Earrings')).toBeInTheDocument()
    })

    it('renders the distinct "finalising" state from the session snapshot too (guest checkout has no initialOrder)', async () => {
      const order = buildOrder({ orderNumber: 'MSE-200002' })
      useLastOrderStore.getState().setOrder(order)

      render(<OrderConfirmation orderNumber="MSE-200002" paymentStatus="processing" />)

      expect(await screen.findByText(/payment received.*finalising your order/i)).toBeInTheDocument()
    })
  })
})
