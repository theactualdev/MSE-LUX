import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CheckoutFlow } from '@/features/checkout/components/checkout-flow'
import { placeOrder } from '@/features/checkout/data'
import { getShippingRates } from '@/features/checkout/shipping'
import { initializePayment, verifyPayment } from '@/features/checkout/payments'
import { validateDiscountCode } from '@/features/discounts/actions'
import { useCart } from '@/features/cart/use-cart'
import type { Product } from '@/types/catalog'
import type { CartLine } from '@/features/cart/lib/lines'
import type { Contact, Address } from '@/features/checkout/schema'
import type { ShippingOption } from '@/features/checkout/shipping-types'

const push = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
}))

vi.mock('@/features/checkout/data', () => ({
  placeOrder: vi.fn(),
}))

vi.mock('@/features/checkout/shipping', () => ({
  getShippingRates: vi.fn(),
}))

vi.mock('@/features/checkout/payments', () => ({
  initializePayment: vi.fn(),
  verifyPayment: vi.fn(),
}))

vi.mock('@/features/discounts/actions', () => ({
  validateDiscountCode: vi.fn(),
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

// The popup import is dynamic (`await import('@paystack/inline-js')`) inside
// the handler, so it's mocked the same way any other module dependency is:
// the default export is a constructor whose instance's `resumeTransaction`
// is a test-controlled spy that invokes whichever callback the test wants.
const resumeTransaction = vi.fn()

vi.mock('@paystack/inline-js', () => ({
  // `vi.fn(() => ...)` can't be `new`ed (arrow functions aren't
  // constructible) — the real SDK is a class, so the mock needs a real
  // function/class too.
  default: vi.fn(function PaystackMock() {
    return { resumeTransaction }
  }),
}))

const placeOrderMock = vi.mocked(placeOrder)
const getShippingRatesMock = vi.mocked(getShippingRates)
const initializePaymentMock = vi.mocked(initializePayment)
const verifyPaymentMock = vi.mocked(verifyPayment)
const validateDiscountCodeMock = vi.mocked(validateDiscountCode)
const useCartMock = vi.mocked(useCart)

const SHIPPING_OPTIONS: ShippingOption[] = [
  { id: 'lagos', label: 'Lagos delivery', amountMinor: 250_000, currency: 'NGN', deliveryEta: '1–2 days', token: 'token-lagos' },
  { id: 'nationwide', label: 'Nationwide delivery', amountMinor: 500_000, currency: 'NGN', deliveryEta: '3–5 days', token: 'token-nationwide' },
]

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
    getShippingRatesMock.mockReset()
    getShippingRatesMock.mockResolvedValue(SHIPPING_OPTIONS)
    initializePaymentMock.mockReset()
    verifyPaymentMock.mockReset()
    validateDiscountCodeMock.mockReset()
    resumeTransaction.mockReset()
    mockCart()
  })

  it('starts the contact step prefilled from initialContact', async () => {
    render(<CheckoutFlow initialContact={contact} initialAddress={address} />)

    expect(await screen.findByLabelText(/email/i)).toHaveValue('ada@example.com')
  })

  it('fetches and renders the live shipping options after the address step', async () => {
    const user = userEvent.setup({ delay: null })
    render(<CheckoutFlow initialContact={contact} initialAddress={address} />)

    await user.click(await screen.findByRole('button', { name: /continue/i })) // contact -> address
    await user.click(await screen.findByRole('button', { name: /continue/i })) // address -> shipping

    await waitFor(() => expect(getShippingRatesMock).toHaveBeenCalledTimes(1))

    // Both options render in the radio group; "Lagos delivery" also appears
    // a second time in the persistent OrderSummaryPanel (the default
    // selection), so assert via the radiogroup rather than a bare text query.
    const group = await screen.findByRole('radiogroup', { name: /shipping method/i })
    expect(within(group).getByText('Lagos delivery')).toBeInTheDocument()
    expect(within(group).getByText('Nationwide delivery')).toBeInTheDocument()
  })

  it('shows an inline alert and stays on the address step when getShippingRates returns no options (the missing-secret hardening)', async () => {
    const user = userEvent.setup({ delay: null })
    getShippingRatesMock.mockResolvedValue([])

    render(<CheckoutFlow initialContact={contact} initialAddress={address} />)

    await user.click(await screen.findByRole('button', { name: /continue/i })) // contact -> address
    await user.click(await screen.findByRole('button', { name: /continue/i })) // submit address

    await waitFor(() => expect(getShippingRatesMock).toHaveBeenCalledTimes(1))

    expect(await screen.findByRole('alert')).toHaveTextContent(/shipping options are temporarily unavailable/i)
    // Still on the address step — its own field is visible, and the
    // shipping step's radiogroup never rendered.
    expect(screen.getByLabelText(/full name/i)).toBeInTheDocument()
    expect(screen.queryByRole('radiogroup', { name: /shipping method/i })).not.toBeInTheDocument()
  })

  it('places the order, initializes payment, opens the popup, verifies, then stores, clears, and navigates', async () => {
    const user = userEvent.setup({ delay: null })
    const order = { orderNumber: 'MSE-123456' } as never
    placeOrderMock.mockResolvedValue({ ok: true, order })
    initializePaymentMock.mockResolvedValue({ ok: true, accessCode: 'code_1', publicKey: 'pk_test_1' })
    verifyPaymentMock.mockResolvedValue({ ok: true, status: 'paid' })
    resumeTransaction.mockImplementation((_accessCode: string, opts: { onSuccess: (t: { reference: string }) => void }) => {
      opts.onSuccess({ reference: 'ref_1' })
    })

    const { clear } = useCartMock()
    render(<CheckoutFlow initialContact={contact} initialAddress={address} />)

    await driveToReview(user)

    // Submitting the address step fetches live shipping rates for that
    // address (+ contact email + guest lines), never a static mock list.
    await waitFor(() => expect(getShippingRatesMock).toHaveBeenCalledWith({
      address: { ...address, line2: '', postalCode: '' },
      email: contact.email,
      chargeCurrency: 'NGN',
      guestLines: [{ productId: 'p1', variantId: undefined, quantity: 2 }],
    }))

    await user.click(screen.getByRole('button', { name: /place order/i }))

    await waitFor(() => expect(placeOrderMock).toHaveBeenCalledTimes(1))
    expect(placeOrderMock).toHaveBeenCalledWith({
      contact,
      // AddressStep round-trips the optional fields through react-hook-form,
      // which fills unset optional inputs with '' rather than leaving them
      // undefined.
      address: { ...address, line2: '', postalCode: '' },
      // The FIRST returned shipping option is selected by default; its
      // opaque `token` — never a client-computed amount — is what reaches
      // `placeOrder`.
      shippingToken: SHIPPING_OPTIONS[0].token,
      chargeCurrency: 'NGN',
      guestLines: [{ productId: 'p1', variantId: undefined, quantity: 2 }],
      // isSignedIn was not passed (defaults false), so AddressStep never
      // rendered the checkbox and saveAddress stays at its unchecked default.
      saveAddress: false,
    })

    await waitFor(() => expect(initializePaymentMock).toHaveBeenCalledWith('MSE-123456'))
    await waitFor(() => expect(resumeTransaction).toHaveBeenCalledWith('code_1', expect.any(Object)))
    await waitFor(() => expect(verifyPaymentMock).toHaveBeenCalledWith('ref_1'))

    await waitFor(() => expect(push).toHaveBeenCalledWith('/order/MSE-123456'))
    expect(setOrder).toHaveBeenCalledWith(order)
    expect(clear).toHaveBeenCalledTimes(1)
  })

  it('navigates with a ?status=processing flag (not a plain confirm) when verifyPayment resolves status: "processing"', async () => {
    const user = userEvent.setup({ delay: null })
    const order = { orderNumber: 'MSE-777777' } as never
    placeOrderMock.mockResolvedValue({ ok: true, order })
    initializePaymentMock.mockResolvedValue({ ok: true, accessCode: 'code_1', publicKey: 'pk_test_1' })
    verifyPaymentMock.mockResolvedValue({ ok: true, status: 'processing' })
    resumeTransaction.mockImplementation((_accessCode: string, opts: { onSuccess: (t: { reference: string }) => void }) => {
      opts.onSuccess({ reference: 'ref_1' })
    })

    const { clear } = useCartMock()
    render(<CheckoutFlow initialContact={contact} initialAddress={address} />)

    await driveToReview(user)
    await user.click(screen.getByRole('button', { name: /place order/i }))

    // The order IS placed and paid (Paystack confirmed the charge) — the
    // cart still clears and the flow still navigates, same as 'paid', but
    // the URL carries the flag the confirmation page uses to render the
    // "still finalising" state instead of a plain confirm.
    await waitFor(() => expect(push).toHaveBeenCalledWith('/order/MSE-777777?status=processing'))
    expect(setOrder).toHaveBeenCalledWith(order)
    expect(clear).toHaveBeenCalledTimes(1)
  })

  it('includes saveAddress: true in the placeOrder input when a signed-in user checks the save-address box', async () => {
    const user = userEvent.setup({ delay: null })
    placeOrderMock.mockResolvedValue({ ok: true, order: { orderNumber: 'MSE-123456' } as never })
    initializePaymentMock.mockResolvedValue({ ok: true, accessCode: 'code_1', publicKey: 'pk_test_1' })
    verifyPaymentMock.mockResolvedValue({ ok: true, status: 'paid' })
    resumeTransaction.mockImplementation((_accessCode: string, opts: { onSuccess: (t: { reference: string }) => void }) => {
      opts.onSuccess({ reference: 'ref_1' })
    })

    render(<CheckoutFlow initialContact={contact} initialAddress={address} isSignedIn />)

    await user.click(await screen.findByRole('button', { name: /continue/i })) // contact -> address
    await user.click(screen.getByLabelText(/save this address to my account/i))
    await user.click(screen.getByRole('button', { name: /continue/i })) // address -> shipping
    await user.click(await screen.findByRole('button', { name: /continue/i })) // shipping -> payment
    await user.click(await screen.findByRole('button', { name: /continue to review/i })) // payment -> review
    await screen.findByRole('button', { name: /place order/i })

    await user.click(screen.getByRole('button', { name: /place order/i }))

    await waitFor(() => expect(placeOrderMock).toHaveBeenCalledTimes(1))
    expect(placeOrderMock).toHaveBeenCalledWith(expect.objectContaining({ saveAddress: true }))
  })

  it('threads the applied discount CODE ONLY (never a percentage or amount) into placeOrder', async () => {
    const user = userEvent.setup({ delay: null })
    validateDiscountCodeMock.mockResolvedValue({ ok: true, code: 'LAUNCH20', percentOff: 20 })
    placeOrderMock.mockResolvedValue({
      ok: true,
      // `summary.discount` echoes back the SAME percentOff that was sent —
      // the returned-discount-unchanged happy path — so this stub doesn't
      // trip the changed-total confirm this test isn't exercising.
      order: {
        orderNumber: 'MSE-123456',
        summary: {
          total: { amountMinor: 2_830_000, currency: 'NGN' },
          discount: { code: 'LAUNCH20', percentOff: 20, amount: { amountMinor: 600_000, currency: 'NGN' } },
        },
      } as never,
    })
    initializePaymentMock.mockResolvedValue({ ok: true, accessCode: 'code_1', publicKey: 'pk_test_1' })
    verifyPaymentMock.mockResolvedValue({ ok: true, status: 'paid' })
    resumeTransaction.mockImplementation((_accessCode: string, opts: { onSuccess: (t: { reference: string }) => void }) => {
      opts.onSuccess({ reference: 'ref_1' })
    })

    render(<CheckoutFlow initialContact={contact} initialAddress={address} />)

    await user.type(await screen.findByLabelText(/discount code/i), 'launch20')
    await user.click(screen.getByRole('button', { name: /apply/i }))
    await screen.findByRole('button', { name: /remove/i })

    await driveToReview(user)
    await user.click(screen.getByRole('button', { name: /place order/i }))

    await waitFor(() => expect(placeOrderMock).toHaveBeenCalledTimes(1))
    expect(placeOrderMock).toHaveBeenCalledWith(expect.objectContaining({ discountCode: 'LAUNCH20' }))
    // Never a percentage or amount — see `PlaceOrderInput.discountCode`'s doc comment.
    const call = placeOrderMock.mock.calls[0][0] as unknown as Record<string, unknown>
    expect(call).not.toHaveProperty('discountPercent')
    expect(call).not.toHaveProperty('discountMinor')
  })

  it('shows the SAME discounted total in the review step content and the sidebar order summary panel (one computed summary, not two)', async () => {
    const user = userEvent.setup({ delay: null })
    validateDiscountCodeMock.mockResolvedValue({ ok: true, code: 'LAUNCH20', percentOff: 20 })

    render(<CheckoutFlow initialContact={contact} initialAddress={address} />)

    // The discount field lives inside the persistent sidebar panel, present
    // from the first step onward.
    await user.type(await screen.findByLabelText(/discount code/i), 'launch20')
    await user.click(screen.getByRole('button', { name: /apply/i }))
    await screen.findByRole('button', { name: /remove/i })

    await driveToReview(user)

    // Subtotal is ₦30,000 (2 × ₦15,000). 20% off = ₦6,000 discount, so tax
    // is 7.5% of the discounted ₦24,000 = ₦1,800; total = 24,000 + 2,500
    // (Lagos delivery, the default shipping selection) + 1,800 = ₦28,300.
    // Both the review content's summary and the sidebar's summary must show
    // this exact figure — if a future change reintroduces a per-component
    // derivation (e.g. one panel forgetting to apply the discount), this
    // assertion catches the resulting split total.
    const totals = screen.getAllByText('₦28,300.00')
    expect(totals).toHaveLength(2)
  })

  it('omits discountCode (undefined) when no discount code was applied', async () => {
    const user = userEvent.setup({ delay: null })
    placeOrderMock.mockResolvedValue({ ok: true, order: { orderNumber: 'MSE-123456' } as never })
    initializePaymentMock.mockResolvedValue({ ok: true, accessCode: 'code_1', publicKey: 'pk_test_1' })
    verifyPaymentMock.mockResolvedValue({ ok: true, status: 'paid' })
    resumeTransaction.mockImplementation((_accessCode: string, opts: { onSuccess: (t: { reference: string }) => void }) => {
      opts.onSuccess({ reference: 'ref_1' })
    })

    render(<CheckoutFlow initialContact={contact} initialAddress={address} />)

    await driveToReview(user)
    await user.click(screen.getByRole('button', { name: /place order/i }))

    await waitFor(() => expect(placeOrderMock).toHaveBeenCalledTimes(1))
    expect(placeOrderMock.mock.calls[0][0]).toEqual(expect.objectContaining({ discountCode: undefined }))
    expect(validateDiscountCodeMock).not.toHaveBeenCalled()
  })

  it('shows the error and does not navigate or clear the cart when placeOrder fails', async () => {
    const user = userEvent.setup({ delay: null })
    placeOrderMock.mockResolvedValue({ error: 'Something went wrong. Please try again.' })

    const { clear } = useCartMock()
    render(<CheckoutFlow initialContact={contact} initialAddress={address} />)

    await driveToReview(user)
    await user.click(screen.getByRole('button', { name: /place order/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/something went wrong/i)
    expect(initializePaymentMock).not.toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
    expect(clear).not.toHaveBeenCalled()
    expect(setOrder).not.toHaveBeenCalled()
  })

  it('shows the error and does not open the popup when initializePayment fails', async () => {
    const user = userEvent.setup({ delay: null })
    placeOrderMock.mockResolvedValue({ ok: true, order: { orderNumber: 'MSE-123456' } as never })
    initializePaymentMock.mockResolvedValue({ error: 'Could not start payment. Please try again.' })

    const { clear } = useCartMock()
    render(<CheckoutFlow initialContact={contact} initialAddress={address} />)

    await driveToReview(user)
    await user.click(screen.getByRole('button', { name: /place order/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not start payment/i)
    expect(resumeTransaction).not.toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
    expect(clear).not.toHaveBeenCalled()
    expect(setOrder).not.toHaveBeenCalled()
  })

  it('returns to review with the cart intact when the popup is cancelled', async () => {
    const user = userEvent.setup({ delay: null })
    placeOrderMock.mockResolvedValue({ ok: true, order: { orderNumber: 'MSE-123456' } as never })
    initializePaymentMock.mockResolvedValue({ ok: true, accessCode: 'code_1', publicKey: 'pk_test_1' })
    resumeTransaction.mockImplementation((_accessCode: string, opts: { onCancel: () => void }) => {
      opts.onCancel()
    })

    const { clear } = useCartMock()
    render(<CheckoutFlow initialContact={contact} initialAddress={address} />)

    await driveToReview(user)
    await user.click(screen.getByRole('button', { name: /place order/i }))

    await waitFor(() => expect(resumeTransaction).toHaveBeenCalled())
    // Back on the review step, ready to retry.
    expect(await screen.findByRole('button', { name: /place order/i })).toBeInTheDocument()
    expect(verifyPaymentMock).not.toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
    expect(clear).not.toHaveBeenCalled()
    expect(setOrder).not.toHaveBeenCalled()
  })

  it('does not open the popup and shows the changed-total state when a discount was sent but none came back', async () => {
    const user = userEvent.setup({ delay: null })
    validateDiscountCodeMock.mockResolvedValue({ ok: true, code: 'LAUNCH20', percentOff: 20 })
    const order = {
      orderNumber: 'MSE-123456',
      summary: { total: { amountMinor: 430_000, currency: 'NGN' } },
    } as never
    placeOrderMock.mockResolvedValue({ ok: true, order })

    render(<CheckoutFlow initialContact={contact} initialAddress={address} />)

    await user.type(await screen.findByLabelText(/discount code/i), 'launch20')
    await user.click(screen.getByRole('button', { name: /apply/i }))
    await screen.findByRole('button', { name: /remove/i })

    await driveToReview(user)
    await user.click(screen.getByRole('button', { name: /place order/i }))

    await waitFor(() => expect(placeOrderMock).toHaveBeenCalledTimes(1))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/LAUNCH20 is no longer available/i)
    expect(alert).toHaveTextContent('₦4,300.00')

    expect(initializePaymentMock).not.toHaveBeenCalled()
    expect(resumeTransaction).not.toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
  })

  it('confirming the changed-total state resumes payment for the ALREADY-PLACED order and does not call placeOrder again', async () => {
    const user = userEvent.setup({ delay: null })
    validateDiscountCodeMock.mockResolvedValue({ ok: true, code: 'LAUNCH20', percentOff: 20 })
    const order = {
      orderNumber: 'MSE-999999',
      summary: { total: { amountMinor: 430_000, currency: 'NGN' } },
    } as never
    placeOrderMock.mockResolvedValue({ ok: true, order })
    initializePaymentMock.mockResolvedValue({ ok: true, accessCode: 'code_1', publicKey: 'pk_test_1' })
    verifyPaymentMock.mockResolvedValue({ ok: true, status: 'paid' })
    resumeTransaction.mockImplementation((_accessCode: string, opts: { onSuccess: (t: { reference: string }) => void }) => {
      opts.onSuccess({ reference: 'ref_1' })
    })

    const { clear } = useCartMock()
    render(<CheckoutFlow initialContact={contact} initialAddress={address} />)

    await user.type(await screen.findByLabelText(/discount code/i), 'launch20')
    await user.click(screen.getByRole('button', { name: /apply/i }))
    await screen.findByRole('button', { name: /remove/i })

    await driveToReview(user)
    await user.click(screen.getByRole('button', { name: /place order/i }))

    await screen.findByRole('alert')
    await user.click(screen.getByRole('button', { name: /continue to payment/i }))

    await waitFor(() => expect(initializePaymentMock).toHaveBeenCalledWith('MSE-999999'))
    expect(placeOrderMock).toHaveBeenCalledTimes(1) // never a second placeOrder call

    await waitFor(() => expect(push).toHaveBeenCalledWith('/order/MSE-999999'))
    expect(setOrder).toHaveBeenCalledWith(order)
    expect(clear).toHaveBeenCalledTimes(1)
  })

  it('proceeds straight to payment with no interruption when the returned discount matches what was sent (pins the happy path)', async () => {
    const user = userEvent.setup({ delay: null })
    validateDiscountCodeMock.mockResolvedValue({ ok: true, code: 'LAUNCH20', percentOff: 20 })
    const order = {
      orderNumber: 'MSE-555555',
      summary: {
        total: { amountMinor: 2_830_000, currency: 'NGN' },
        discount: { code: 'LAUNCH20', percentOff: 20, amount: { amountMinor: 600_000, currency: 'NGN' } },
      },
    } as never
    placeOrderMock.mockResolvedValue({ ok: true, order })
    initializePaymentMock.mockResolvedValue({ ok: true, accessCode: 'code_1', publicKey: 'pk_test_1' })
    verifyPaymentMock.mockResolvedValue({ ok: true, status: 'paid' })
    resumeTransaction.mockImplementation((_accessCode: string, opts: { onSuccess: (t: { reference: string }) => void }) => {
      opts.onSuccess({ reference: 'ref_1' })
    })

    const { clear } = useCartMock()
    render(<CheckoutFlow initialContact={contact} initialAddress={address} />)

    await user.type(await screen.findByLabelText(/discount code/i), 'launch20')
    await user.click(screen.getByRole('button', { name: /apply/i }))
    await screen.findByRole('button', { name: /remove/i })

    await driveToReview(user)
    await user.click(screen.getByRole('button', { name: /place order/i }))

    // Straight through to payment — no changed-total interruption at all.
    await waitFor(() => expect(initializePaymentMock).toHaveBeenCalledWith('MSE-555555'))
    expect(placeOrderMock).toHaveBeenCalledTimes(1)

    await waitFor(() => expect(push).toHaveBeenCalledWith('/order/MSE-555555'))
    expect(setOrder).toHaveBeenCalledWith(order)
    expect(clear).toHaveBeenCalledTimes(1)
  })

  it('clears the applied discount on a dropped-discount cancel, so the review step no longer shows the stale discounted total', async () => {
    const user = userEvent.setup({ delay: null })
    validateDiscountCodeMock.mockResolvedValue({ ok: true, code: 'LAUNCH20', percentOff: 20 })
    const order = {
      orderNumber: 'MSE-123456',
      // No `discount` member at all — the code is gone. Total is the full,
      // undiscounted price for the same cart the other tests use: subtotal
      // ₦30,000, tax 7.5% of ₦30,000 = ₦2,250, + ₦2,500 shipping = ₦34,750.
      summary: { total: { amountMinor: 3_475_000, currency: 'NGN' } },
    } as never
    placeOrderMock.mockResolvedValue({ ok: true, order })
    initializePaymentMock.mockResolvedValue({ ok: true, accessCode: 'code_1', publicKey: 'pk_test_1' })
    resumeTransaction.mockImplementation((_accessCode: string, opts: { onCancel: () => void }) => {
      opts.onCancel()
    })

    render(<CheckoutFlow initialContact={contact} initialAddress={address} />)

    await user.type(await screen.findByLabelText(/discount code/i), 'launch20')
    await user.click(screen.getByRole('button', { name: /apply/i }))
    await screen.findByRole('button', { name: /remove/i })

    await driveToReview(user)
    await user.click(screen.getByRole('button', { name: /place order/i }))

    // Confirm through the changed-total screen, then cancel the Paystack popup.
    await screen.findByRole('alert')
    await user.click(screen.getByRole('button', { name: /continue to payment/i }))
    await waitFor(() => expect(resumeTransaction).toHaveBeenCalled())

    // Back on the review step — the discount is gone entirely: no "Remove"
    // control (DiscountField renders the empty input again) and no discount
    // row, and the total is the true, undiscounted figure.
    expect(await screen.findByRole('button', { name: /place order/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/LAUNCH20/)).not.toBeInTheDocument()
    const totals = screen.getAllByText('₦34,750.00')
    expect(totals).toHaveLength(2)
  })

  it('shows the "Go back" control on the changed-total screen, returning to review without calling initializePayment', async () => {
    const user = userEvent.setup({ delay: null })
    validateDiscountCodeMock.mockResolvedValue({ ok: true, code: 'LAUNCH20', percentOff: 20 })
    const order = {
      orderNumber: 'MSE-123456',
      summary: { total: { amountMinor: 430_000, currency: 'NGN' } },
    } as never
    placeOrderMock.mockResolvedValue({ ok: true, order })

    render(<CheckoutFlow initialContact={contact} initialAddress={address} />)

    await user.type(await screen.findByLabelText(/discount code/i), 'launch20')
    await user.click(screen.getByRole('button', { name: /apply/i }))
    await screen.findByRole('button', { name: /remove/i })

    await driveToReview(user)
    await user.click(screen.getByRole('button', { name: /place order/i }))

    await screen.findByRole('alert')
    await user.click(screen.getByRole('button', { name: /go back/i }))

    // Back on review — no payment was ever initialised.
    expect(await screen.findByRole('button', { name: /place order/i })).toBeInTheDocument()
    expect(initializePaymentMock).not.toHaveBeenCalled()
    expect(resumeTransaction).not.toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
  })

  it('shows the error and does not navigate when verifyPayment fails', async () => {
    const user = userEvent.setup({ delay: null })
    placeOrderMock.mockResolvedValue({ ok: true, order: { orderNumber: 'MSE-123456' } as never })
    initializePaymentMock.mockResolvedValue({ ok: true, accessCode: 'code_1', publicKey: 'pk_test_1' })
    verifyPaymentMock.mockResolvedValue({ error: 'Could not confirm payment. Please try again.' })
    resumeTransaction.mockImplementation((_accessCode: string, opts: { onSuccess: (t: { reference: string }) => void }) => {
      opts.onSuccess({ reference: 'ref_1' })
    })

    const { clear } = useCartMock()
    render(<CheckoutFlow initialContact={contact} initialAddress={address} />)

    await driveToReview(user)
    await user.click(screen.getByRole('button', { name: /place order/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not confirm payment/i)
    expect(push).not.toHaveBeenCalled()
    expect(clear).not.toHaveBeenCalled()
    expect(setOrder).not.toHaveBeenCalled()
  })
})
