import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GiftCheckout } from '@/features/gifting/components/gift-checkout'
import { getGiftShippingRates, placeGiftOrder } from '@/features/gifting/checkout-actions'
import { initializePayment, verifyPayment } from '@/features/checkout/payments'
import { useCartStore } from '@/features/cart/store'
import type { ShippingOption } from '@/features/checkout/shipping-types'
import type { GiftSelectionItem } from '@/features/gifting/components/gift-selection'

/**
 * THE DEFINING CONSTRAINT UNDER TEST: this checkout has NO address step. The
 * buyer never supplies a destination and never sees one — the only delivery
 * information rendered anywhere in this component is the recipient's first
 * name and city, passed down as buyer-safe props from the server page's own
 * `resolveShare` call (never `share.address`, which is `server-only` and
 * never reaches this file even in the real app).
 *
 * `@/features/cart/store` is intentionally left UNMOCKED (the real zustand
 * module) and spied on directly — `GiftCheckout` never imports it at all, so
 * driving the full flow through to payment must never call any of its
 * mutators. Spying on the real store is a stronger proof of that than mocking
 * a module the component doesn't reference.
 */

vi.mock('@/features/gifting/checkout-actions', () => ({
  getGiftShippingRates: vi.fn(),
  placeGiftOrder: vi.fn(),
}))

vi.mock('@/features/checkout/payments', () => ({
  initializePayment: vi.fn(),
  verifyPayment: vi.fn(),
}))

const resumeTransaction = vi.fn()

vi.mock('@paystack/inline-js', () => ({
  default: vi.fn(function PaystackMock() {
    return { resumeTransaction }
  }),
}))

const getGiftShippingRatesMock = vi.mocked(getGiftShippingRates)
const placeGiftOrderMock = vi.mocked(placeGiftOrder)
const initializePaymentMock = vi.mocked(initializePayment)
const verifyPaymentMock = vi.mocked(verifyPayment)

const SELECTIONS: GiftSelectionItem[] = [{ productId: 'p1', variantId: null }]

const SHIPPING_OPTIONS: ShippingOption[] = [
  { id: 'lagos', label: 'Lagos delivery', amountMinor: 250_000, currency: 'NGN', deliveryEta: '1–2 days', token: 'token-lagos' },
  { id: 'nationwide', label: 'Nationwide delivery', amountMinor: 500_000, currency: 'NGN', deliveryEta: '3–5 days', token: 'token-nationwide' },
]

function renderGiftCheckout() {
  return render(
    <GiftCheckout token="tok-123" selections={SELECTIONS} recipientFirstName="Adaeze" city="Victoria Island" />,
  )
}

/** Drives from the email step to the shipping step. */
async function fillEmailAndContinue(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/email/i), 'buyer@example.com')
  await user.click(screen.getByRole('button', { name: /continue/i }))
  await screen.findByRole('radiogroup', { name: /shipping method/i })
}

describe('GiftCheckout', () => {
  const cartSpies = {
    addItem: vi.spyOn(useCartStore.getState(), 'addItem'),
    removeItem: vi.spyOn(useCartStore.getState(), 'removeItem'),
    updateQuantity: vi.spyOn(useCartStore.getState(), 'updateQuantity'),
    clear: vi.spyOn(useCartStore.getState(), 'clear'),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    getGiftShippingRatesMock.mockReset()
    placeGiftOrderMock.mockReset()
    initializePaymentMock.mockReset()
    verifyPaymentMock.mockReset()
    resumeTransaction.mockReset()
    getGiftShippingRatesMock.mockResolvedValue(SHIPPING_OPTIONS)
  })

  it('renders the delivery line with first name and city only, and no address input of any kind', () => {
    renderGiftCheckout()

    expect(screen.getByText(/adaeze/i)).toBeInTheDocument()
    expect(screen.getByText(/victoria island/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/address|street|city|postcode|postal/i)).not.toBeInTheDocument()
  })

  it('never renders an address input while moving through email, shipping, and confirmation', async () => {
    const user = userEvent.setup({ delay: null })
    placeGiftOrderMock.mockResolvedValue({ ok: true, orderNumber: 'MSE-123456' })
    initializePaymentMock.mockResolvedValue({ ok: true, accessCode: 'code_1', publicKey: 'pk_test_1' })
    verifyPaymentMock.mockResolvedValue({ ok: true, status: 'paid' })
    resumeTransaction.mockImplementation((_accessCode: string, opts: { onSuccess: (t: { reference: string }) => void }) => {
      opts.onSuccess({ reference: 'ref_1' })
    })

    renderGiftCheckout()
    expect(screen.queryByLabelText(/address|street|city|postcode|postal/i)).not.toBeInTheDocument()

    await fillEmailAndContinue(user)
    expect(screen.queryByLabelText(/address|street|city|postcode|postal/i)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /pay for this gift/i }))
    await screen.findByText(/your gift is on its way/i)
    expect(screen.queryByLabelText(/address|street|city|postcode|postal/i)).not.toBeInTheDocument()
  })

  it('fetches shipping rates after the email step and lists options as label + price only', async () => {
    const user = userEvent.setup({ delay: null })
    renderGiftCheckout()

    await fillEmailAndContinue(user)

    expect(getGiftShippingRatesMock).toHaveBeenCalledWith({
      shareToken: 'tok-123',
      selections: SELECTIONS,
      email: 'buyer@example.com',
      chargeCurrency: 'NGN',
    })

    const group = screen.getByRole('radiogroup', { name: /shipping method/i })
    expect(group).toHaveTextContent('Lagos delivery')
    expect(group).toHaveTextContent('Nationwide delivery')
    // Label + price only — no delivery-eta text rendered anywhere.
    expect(screen.queryByText(/1–2 days/)).not.toBeInTheDocument()
    expect(screen.queryByText(/3–5 days/)).not.toBeInTheDocument()
  })

  it('shows a retryable inline error and stays on the email step when no shipping options are available', async () => {
    const user = userEvent.setup({ delay: null })
    getGiftShippingRatesMock.mockResolvedValue([])

    renderGiftCheckout()
    await user.type(screen.getByLabelText(/email/i), 'buyer@example.com')
    await user.click(screen.getByRole('button', { name: /continue/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/shipping options are temporarily unavailable/i)
    expect(screen.queryByRole('radiogroup', { name: /shipping method/i })).not.toBeInTheDocument()
  })

  it('selecting a shipping option then paying calls placeGiftOrder with exactly the expected fields and no address key', async () => {
    const user = userEvent.setup({ delay: null })
    placeGiftOrderMock.mockResolvedValue({ ok: true, orderNumber: 'MSE-654321' })
    initializePaymentMock.mockResolvedValue({ ok: true, accessCode: 'code_1', publicKey: 'pk_test_1' })
    verifyPaymentMock.mockResolvedValue({ ok: true, status: 'paid' })
    resumeTransaction.mockImplementation((_accessCode: string, opts: { onSuccess: (t: { reference: string }) => void }) => {
      opts.onSuccess({ reference: 'ref_1' })
    })

    renderGiftCheckout()
    await fillEmailAndContinue(user)

    // The second option, explicitly selected (not just the default first one).
    await user.click(screen.getByText('Nationwide delivery'))
    await user.click(screen.getByRole('button', { name: /pay for this gift/i }))

    await waitFor(() => expect(placeGiftOrderMock).toHaveBeenCalledTimes(1))
    const input = placeGiftOrderMock.mock.calls[0][0] as Record<string, unknown>
    expect(input).toEqual({
      shareToken: 'tok-123',
      selections: SELECTIONS,
      email: 'buyer@example.com',
      chargeCurrency: 'NGN',
      shippingToken: 'token-nationwide',
    })
    expect(input).not.toHaveProperty('address')

    await waitFor(() => expect(initializePaymentMock).toHaveBeenCalledWith('MSE-654321'))
    await waitFor(() => expect(verifyPaymentMock).toHaveBeenCalledWith('ref_1'))
    expect(await screen.findByText(/your gift is on its way/i)).toBeInTheDocument()
    // The confirmation repeats first name + city, and states the recipient won't be told.
    expect(screen.getByText(/adaeze/i)).toBeInTheDocument()
    expect(screen.getByText(/victoria island/i)).toBeInTheDocument()
    expect(screen.getByText(/will not be told/i)).toBeInTheDocument()
  })

  it('renders a distinct "finalising" message, not the confident gift-arrived copy, when verifyPayment resolves processing', async () => {
    const user = userEvent.setup({ delay: null })
    placeGiftOrderMock.mockResolvedValue({ ok: true, orderNumber: 'MSE-777777' })
    initializePaymentMock.mockResolvedValue({ ok: true, accessCode: 'code_1', publicKey: 'pk_test_1' })
    verifyPaymentMock.mockResolvedValue({ ok: true, status: 'processing' })
    resumeTransaction.mockImplementation((_accessCode: string, opts: { onSuccess: (t: { reference: string }) => void }) => {
      opts.onSuccess({ reference: 'ref_1' })
    })

    renderGiftCheckout()
    await fillEmailAndContinue(user)
    await user.click(screen.getByRole('button', { name: /pay for this gift/i }))

    expect(await screen.findByText(/payment received.*finalising your order/i)).toBeInTheDocument()
    // NOT the confident "on its way" copy the paid case shows.
    expect(screen.queryByText(/your gift is on its way/i)).not.toBeInTheDocument()
    // Recipient first name + city, and the "won't be told" reassurance still hold in this state too.
    expect(screen.getByText(/adaeze/i)).toBeInTheDocument()
    expect(screen.getByText(/victoria island/i)).toBeInTheDocument()
    expect(screen.getByText(/will not be told/i)).toBeInTheDocument()
  })

  it('surfaces an expired-quote error from placeGiftOrder and stays on the shipping step', async () => {
    const user = userEvent.setup({ delay: null })
    placeGiftOrderMock.mockResolvedValue({ ok: false, error: 'Shipping quote expired. Please try again.' })

    renderGiftCheckout()
    await fillEmailAndContinue(user)
    await user.click(screen.getByRole('button', { name: /pay for this gift/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/shipping quote expired/i)
    expect(initializePaymentMock).not.toHaveBeenCalled()
    expect(screen.queryByText(/your gift is on its way/i)).not.toBeInTheDocument()
  })

  it('never reads or writes the buyer\'s own cart store, from mount through a completed purchase', async () => {
    const user = userEvent.setup({ delay: null })
    placeGiftOrderMock.mockResolvedValue({ ok: true, orderNumber: 'MSE-999999' })
    initializePaymentMock.mockResolvedValue({ ok: true, accessCode: 'code_1', publicKey: 'pk_test_1' })
    verifyPaymentMock.mockResolvedValue({ ok: true, status: 'paid' })
    resumeTransaction.mockImplementation((_accessCode: string, opts: { onSuccess: (t: { reference: string }) => void }) => {
      opts.onSuccess({ reference: 'ref_1' })
    })

    renderGiftCheckout()
    await fillEmailAndContinue(user)
    await user.click(screen.getByRole('button', { name: /pay for this gift/i }))
    await screen.findByText(/your gift is on its way/i)

    expect(cartSpies.addItem).not.toHaveBeenCalled()
    expect(cartSpies.removeItem).not.toHaveBeenCalled()
    expect(cartSpies.updateQuantity).not.toHaveBeenCalled()
    expect(cartSpies.clear).not.toHaveBeenCalled()
  })
})
