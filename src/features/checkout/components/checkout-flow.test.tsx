import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CheckoutFlow } from '@/features/checkout/components/checkout-flow'
import { placeOrder } from '@/features/checkout/data'
import { useCart } from '@/features/cart/use-cart'
import type { Product } from '@/types/catalog'
import type { CartLine } from '@/features/cart/lib/lines'
import type { Contact, Address } from '@/features/checkout/schema'

const push = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
}))

vi.mock('@/features/checkout/data', () => ({
  placeOrder: vi.fn(),
}))

vi.mock('@/features/cart/use-cart', () => ({
  useCart: vi.fn(),
}))

const setOrder = vi.fn()

vi.mock('@/features/checkout/store', () => ({
  useLastOrderStore: {
    getState: () => ({ order: null, setOrder, clear: vi.fn() }),
  },
}))

const placeOrderMock = vi.mocked(placeOrder)
const useCartMock = vi.mocked(useCart)

const product = {
  id: 'p1',
  name: 'Aurora Tennis Bracelet',
  images: [{ src: '/aurora.jpg', alt: 'Aurora Tennis Bracelet' }],
  variants: [],
} as unknown as Product

const line: CartLine = {
  product,
  variant: undefined,
  image: { src: '/aurora.jpg', alt: 'Aurora Tennis Bracelet' },
  quantity: 2,
  unitPrice: { amountMinor: 1_500_000, currency: 'NGN' },
  lineTotal: { amountMinor: 3_000_000, currency: 'NGN' },
}

const contact: Contact = { email: 'ada@example.com' }

const address: Address = {
  fullName: 'Ada Lovelace',
  phone: '08012345678',
  line1: '1 Marina Road',
  city: 'Lagos',
  state: 'Lagos',
  country: 'Nigeria',
}

function mockCart() {
  useCartMock.mockReturnValue({
    items: [],
    lines: [line],
    itemCount: line.quantity,
    add: vi.fn(),
    setQty: vi.fn(),
    remove: vi.fn(),
    clear: vi.fn(),
    isPending: false,
    isLoading: false,
    chargeCurrency: 'NGN',
  })
}

/** Drives the flow from the contact step to the review step, assuming both
 * `contact` and `address` steps already have valid default values (via
 * `initialContact`/`initialAddress`) so each step's form can be submitted
 * without typing into it. */
async function driveToReview(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: /continue/i })) // contact -> address
  await user.click(await screen.findByRole('button', { name: /continue/i })) // address -> shipping
  await user.click(await screen.findByRole('button', { name: /continue/i })) // shipping -> payment
  await user.click(await screen.findByRole('button', { name: /continue to review/i })) // payment -> review
  await screen.findByRole('button', { name: /place order/i })
}

describe('CheckoutFlow', () => {
  beforeEach(() => {
    push.mockClear()
    setOrder.mockClear()
    placeOrderMock.mockReset()
    mockCart()
  })

  it('starts the contact step prefilled from initialContact', async () => {
    render(<CheckoutFlow initialContact={contact} initialAddress={address} />)

    expect(await screen.findByLabelText(/email/i)).toHaveValue('ada@example.com')
  })

  it('places the order with the charge currency and guest line tuples, then stores, clears, and navigates', async () => {
    const user = userEvent.setup({ delay: null })
    placeOrderMock.mockResolvedValue({
      ok: true,
      order: { orderNumber: 'MSE-123456' } as never,
    })

    const { clear } = useCartMock()
    render(<CheckoutFlow initialContact={contact} initialAddress={address} />)

    await driveToReview(user)
    await user.click(screen.getByRole('button', { name: /place order/i }))

    await waitFor(() => expect(placeOrderMock).toHaveBeenCalledTimes(1))
    expect(placeOrderMock).toHaveBeenCalledWith({
      contact,
      // AddressStep round-trips the optional fields through react-hook-form,
      // which fills unset optional inputs with '' rather than leaving them
      // undefined.
      address: { ...address, line2: '', postalCode: '' },
      shippingMethodId: 'lagos',
      chargeCurrency: 'NGN',
      guestLines: [{ productId: 'p1', variantId: undefined, quantity: 2 }],
    })

    await waitFor(() => expect(push).toHaveBeenCalledWith('/order/MSE-123456'))
    expect(setOrder).toHaveBeenCalledWith({ orderNumber: 'MSE-123456' })
    expect(clear).toHaveBeenCalledTimes(1)
  })

  it('shows the error and does not navigate or clear the cart when placeOrder fails', async () => {
    const user = userEvent.setup({ delay: null })
    placeOrderMock.mockResolvedValue({ error: 'Something went wrong. Please try again.' })

    const { clear } = useCartMock()
    render(<CheckoutFlow initialContact={contact} initialAddress={address} />)

    await driveToReview(user)
    await user.click(screen.getByRole('button', { name: /place order/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/something went wrong/i)
    expect(push).not.toHaveBeenCalled()
    expect(clear).not.toHaveBeenCalled()
    expect(setOrder).not.toHaveBeenCalled()
  })
})
