import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { OrderView } from '@/features/checkout/lib/order-view'
import { cleanup } from '@testing-library/react'

const requireUser = vi.fn()
vi.mock('@/features/auth/guards', () => ({ requireUser: () => requireUser() }))

const getProfile = vi.fn()
vi.mock('@/features/account/data', () => ({ getProfile: () => getProfile() }))

const getOrderMock = vi.fn()
vi.mock('@/features/account/data/orders', () => ({
  getOrder: (orderNumber: string) => getOrderMock(orderNumber),
}))

vi.mock('@/features/auth/claims', () => ({
  getCurrentUserId: () => Promise.resolve('test-user-id'),
}))

vi.mock('@/features/account/components/account-shell', () => ({
  AccountShell: ({ children }: { user: unknown; children: React.ReactNode }) => (
    <div data-testid="account-shell">{children}</div>
  ),
}))

vi.mock('next/image', () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ alt, src }: { alt: string; src: string }) => <img alt={alt} src={src} />,
}))

// Import will be done per-test to avoid caching issues

function buildOrderView(overrides?: Partial<OrderView>): OrderView {
  return {
    orderNumber: 'MSE-1001',
    email: 'ada@example.com',
    address: {
      fullName: 'Ada Lovelace',
      phone: '+1 555 123 4567',
      line1: '123 Main St',
      line2: undefined,
      city: 'New York',
      state: 'NY',
      country: 'US',
      postalCode: '10001',
    },
    shippingLabel: 'Standard Shipping',
    lines: [
      {
        name: 'Gold Hoop Earrings',
        variantLabel: undefined,
        image: { src: '/earrings.jpg', alt: 'Gold Hoop Earrings' },
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
    status: 'PROCESSING',
    trackingCarrier: undefined,
    trackingNumber: undefined,
    ...overrides,
  }
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.clearAllMocks()
  requireUser.mockResolvedValue(undefined)
  getProfile.mockResolvedValue({
    name: 'Ada Lovelace',
    email: 'ada@example.com',
  })
  getOrderMock.mockResolvedValue(null)
})

describe('(storefront)/account/orders/[orderNumber] page', () => {
  it('renders the Tracking block with carrier and number when present', async () => {
    vi.resetModules()
    vi.resetAllMocks()
    const order = buildOrderView({
      trackingCarrier: 'GIG Logistics',
      trackingNumber: 'TRK-99',
    })
    requireUser.mockResolvedValue(undefined)
    getProfile.mockResolvedValue({
      name: 'Ada Lovelace',
      email: 'ada@example.com',
    })
    getOrderMock.mockResolvedValue(order)

    const { default: OrderDetailPage } = await import(
      '@/app/(storefront)/account/orders/[orderNumber]/page'
    )
    const tree = await OrderDetailPage({
      params: Promise.resolve({ orderNumber: 'MSE-1001' }),
    })
    const { render, screen } = await import('@testing-library/react')
    render(tree)

    const trackingHeading = screen.getByText('Tracking')
    expect(trackingHeading).toBeInTheDocument()
    // Text is split across elements: "GIG Logistics · " + <span>TRK-99</span>
    expect(trackingHeading.parentElement?.textContent).toContain('GIG Logistics · TRK-99')
  })

  it('does not render a tracking number that was set in the previous test', async () => {
    // This test verifies isolation: it should NOT see TRK-99 from the first test
    vi.resetAllMocks()
    const order = buildOrderView()
    // Explicitly NO tracking number
    const orderWithoutTracking = JSON.parse(JSON.stringify(order))
    requireUser.mockResolvedValue(undefined)
    getProfile.mockResolvedValue({
      name: 'Ada Lovelace',
      email: 'ada@example.com',
    })
    getOrderMock.mockResolvedValue(orderWithoutTracking)

    const { default: OrderDetailPage } = await import(
      '@/app/(storefront)/account/orders/[orderNumber]/page'
    )
    const tree = await OrderDetailPage({
      params: Promise.resolve({ orderNumber: 'MSE-1001' }),
    })
    const { render, screen } = await import('@testing-library/react')
    render(tree)

    // The key assertion: the tracking BLOCK is absent entirely — not just the
    // previous test's number, but the "Tracking" heading itself.
    expect(screen.queryByText('TRK-99')).not.toBeInTheDocument()
    expect(screen.queryByText('Tracking')).not.toBeInTheDocument()
  })
})

afterEach(() => {
  cleanup()
})
