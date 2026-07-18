import type { Order } from '@/features/checkout/lib/place-order'

export type OrderStatus = 'Processing' | 'Shipped' | 'Delivered'

export type MockOrder = Order & { status: OrderStatus }

/**
 * Seeded mock orders for the customer dashboard. `placedAt` values are
 * hard-coded ISO string literals (not generated) so the data is deterministic.
 */
export const MOCK_ORDERS: MockOrder[] = [
  {
    orderNumber: 'MSE-100001',
    email: 'ada.buyer@example.com',
    address: {
      fullName: 'Ada Buyer',
      phone: '0801 234 5678',
      line1: '12 Marina Road',
      city: 'Lagos',
      state: 'Lagos',
      country: 'Nigeria',
      postalCode: '101241',
    },
    shippingLabel: 'Lagos delivery',
    lines: [
      {
        name: 'Aurora Tennis Bracelet',
        image: { src: '/aurora.jpg', alt: 'Aurora Tennis Bracelet' },
        quantity: 1,
        unitPrice: { amountMinor: 2_400_000, currency: 'NGN' },
        lineTotal: { amountMinor: 2_400_000, currency: 'NGN' },
      },
    ],
    summary: {
      subtotal: { amountMinor: 2_400_000, currency: 'NGN' },
      shipping: { amountMinor: 250_000, currency: 'NGN' },
      tax: { amountMinor: 180_000, currency: 'NGN' },
      total: { amountMinor: 2_830_000, currency: 'NGN' },
    },
    placedAt: '2026-05-14T10:30:00.000Z',
    status: 'Delivered',
  },
  {
    orderNumber: 'MSE-100002',
    email: 'chidinma.okafor@example.com',
    address: {
      fullName: 'Chidinma Okafor',
      phone: '0802 345 6789',
      line1: '45 Ahmadu Bello Way',
      city: 'Abuja',
      state: 'FCT',
      country: 'Nigeria',
      postalCode: '900211',
    },
    shippingLabel: 'Nationwide delivery',
    lines: [
      {
        name: 'Solitaire Ring',
        variantLabel: 'Size 6',
        image: { src: '/ring.jpg', alt: 'Solitaire Ring' },
        quantity: 1,
        unitPrice: { amountMinor: 1_500_000, currency: 'NGN' },
        lineTotal: { amountMinor: 1_500_000, currency: 'NGN' },
      },
      {
        name: 'Pearl Drop Earrings',
        image: { src: '/earrings.jpg', alt: 'Pearl Drop Earrings' },
        quantity: 2,
        unitPrice: { amountMinor: 450_000, currency: 'NGN' },
        lineTotal: { amountMinor: 900_000, currency: 'NGN' },
      },
    ],
    summary: {
      subtotal: { amountMinor: 2_400_000, currency: 'NGN' },
      shipping: { amountMinor: 500_000, currency: 'NGN' },
      tax: { amountMinor: 180_000, currency: 'NGN' },
      total: { amountMinor: 3_080_000, currency: 'NGN' },
    },
    placedAt: '2026-06-02T14:05:00.000Z',
    status: 'Delivered',
  },
  {
    orderNumber: 'MSE-100003',
    email: 'grace.adeyemi@example.com',
    address: {
      fullName: 'Grace Adeyemi',
      phone: '+44 7911 123456',
      line1: '221B Baker Street',
      city: 'London',
      state: 'England',
      country: 'United Kingdom',
      postalCode: 'NW1 6XE',
    },
    shippingLabel: 'International',
    lines: [
      {
        name: 'Diamond Pendant Necklace',
        image: { src: '/necklace.jpg', alt: 'Diamond Pendant Necklace' },
        quantity: 1,
        unitPrice: { amountMinor: 3_200_000, currency: 'NGN' },
        lineTotal: { amountMinor: 3_200_000, currency: 'NGN' },
      },
    ],
    summary: {
      subtotal: { amountMinor: 3_200_000, currency: 'NGN' },
      shipping: { amountMinor: 2_000_000, currency: 'NGN' },
      tax: { amountMinor: 240_000, currency: 'NGN' },
      total: { amountMinor: 5_440_000, currency: 'NGN' },
    },
    placedAt: '2026-07-01T09:15:00.000Z',
    status: 'Shipped',
  },
]

export function getMockOrder(orderNumber: string): MockOrder | undefined {
  return MOCK_ORDERS.find((order) => order.orderNumber === orderNumber)
}
