import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BookShipmentDialog } from '@/features/admin/orders/components/book-shipment-dialog'
import { getBookingRatesAction, bookShipmentAction } from '@/features/admin/orders/actions'

vi.mock('@/features/admin/orders/actions', () => ({
  getBookingRatesAction: vi.fn(),
  bookShipmentAction: vi.fn(),
}))

const getBookingRatesActionMock = vi.mocked(getBookingRatesAction)
const bookShipmentActionMock = vi.mocked(bookShipmentAction)

const RATES = [
  { courierId: 'gig', serviceCode: 'gig-standard', label: 'GIG Standard', amountMinor: 250_000, currency: 'NGN' },
  { courierId: 'dhl', serviceCode: 'dhl-express', label: 'DHL Express', amountMinor: 400_000, currency: 'NGN' },
]

function renderDialog(overrides: Partial<React.ComponentProps<typeof BookShipmentDialog>> = {}) {
  const onOpenChange = vi.fn()
  const onShipped = vi.fn()
  const utils = render(
    <BookShipmentDialog
      orderNumber="MSE-1"
      paidShipping={{ amountMinor: 250_000, currency: 'NGN', label: 'GIG Standard' }}
      open={true}
      onOpenChange={onOpenChange}
      onShipped={onShipped}
      {...overrides}
    />,
  )
  return { ...utils, onOpenChange, onShipped }
}

describe('BookShipmentDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches booking rates for the order when opened', async () => {
    getBookingRatesActionMock.mockResolvedValue({
      ok: true,
      requestToken: 'token-1',
      rates: RATES,
      paidShipping: { amountMinor: 250_000, currency: 'NGN', label: 'GIG Standard' },
    })

    renderDialog()

    await vi.waitFor(() => {
      expect(getBookingRatesActionMock).toHaveBeenCalledWith('MSE-1')
    })
  })

  it('renders each rate as a radio option with a formatMoney NGN amount', async () => {
    getBookingRatesActionMock.mockResolvedValue({
      ok: true,
      requestToken: 'token-1',
      rates: RATES,
      paidShipping: { amountMinor: 250_000, currency: 'NGN', label: 'GIG Standard' },
    })

    renderDialog()

    expect(await screen.findByRole('radio', { name: /gig standard/i })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /dhl express/i })).toBeInTheDocument()
    expect(screen.getAllByText(/₦2,500\.00/)).not.toHaveLength(0)
    expect(screen.getByText(/₦4,000\.00/)).toBeInTheDocument()
  })

  it("preselects and highlights the rate matching the customer's paid shipping label", async () => {
    getBookingRatesActionMock.mockResolvedValue({
      ok: true,
      requestToken: 'token-1',
      rates: RATES,
      paidShipping: { amountMinor: 250_000, currency: 'NGN', label: 'GIG Standard' },
    })

    renderDialog()

    const gigRadio = await screen.findByRole('radio', { name: /gig standard/i })
    expect(gigRadio).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByText(/customer.s choice/i)).toBeInTheDocument()
  })

  it('always shows the customer-paid line', async () => {
    getBookingRatesActionMock.mockResolvedValue({
      ok: true,
      requestToken: 'token-1',
      rates: RATES,
      paidShipping: { amountMinor: 250_000, currency: 'NGN', label: 'GIG Standard' },
    })

    renderDialog()

    expect(await screen.findByText(/customer paid/i)).toBeInTheDocument()
  })

  it('shows a numeric delta line when the paid shipping currency is NGN', async () => {
    getBookingRatesActionMock.mockResolvedValue({
      ok: true,
      requestToken: 'token-1',
      rates: RATES,
      paidShipping: { amountMinor: 250_000, currency: 'NGN', label: 'GIG Standard' },
    })

    renderDialog({ paidShipping: { amountMinor: 250_000, currency: 'NGN', label: 'GIG Standard' } })

    await screen.findByText(/customer paid/i)
    expect(screen.getByText(/more than|less than|matches/i)).toBeInTheDocument()
  })

  it('shows only the paid amount, with no delta line, when the paid shipping currency is not NGN', async () => {
    getBookingRatesActionMock.mockResolvedValue({
      ok: true,
      requestToken: 'token-1',
      rates: RATES,
      paidShipping: { amountMinor: 500_00, currency: 'USD', label: 'International' },
    })

    renderDialog({ paidShipping: { amountMinor: 500_00, currency: 'USD', label: 'International' } })

    await screen.findByText(/customer paid/i)
    expect(screen.queryByText(/more than|less than|matches/i)).not.toBeInTheDocument()
  })

  it('booking the selected rate calls bookShipmentAction and onShipped', async () => {
    getBookingRatesActionMock.mockResolvedValue({
      ok: true,
      requestToken: 'token-1',
      rates: RATES,
      paidShipping: { amountMinor: 250_000, currency: 'NGN', label: 'GIG Standard' },
    })
    bookShipmentActionMock.mockResolvedValue({ ok: true })
    const user = userEvent.setup({ delay: null })

    const { onShipped } = renderDialog()

    await screen.findByRole('radio', { name: /gig standard/i })
    await user.click(screen.getByRole('button', { name: /book & mark shipped/i }))

    await vi.waitFor(() => {
      expect(bookShipmentActionMock).toHaveBeenCalledWith('MSE-1', {
        requestToken: 'token-1',
        courierId: 'gig',
        serviceCode: 'gig-standard',
      })
    })
    await vi.waitFor(() => {
      expect(onShipped).toHaveBeenCalled()
    })
  })

  it('a rates error shows an alert with a hint to enter tracking manually instead', async () => {
    getBookingRatesActionMock.mockResolvedValue({ ok: false, error: 'shipbubble-error' })

    renderDialog()

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/enter tracking manually instead/i)
  })

  it('a booking conflict that carries a shipbubbleOrderId surfaces the ShipBubble reference', async () => {
    getBookingRatesActionMock.mockResolvedValue({
      ok: true,
      requestToken: 'token-1',
      rates: RATES,
      paidShipping: { amountMinor: 250_000, currency: 'NGN', label: 'GIG Standard' },
    })
    bookShipmentActionMock.mockResolvedValue({ ok: false, error: 'conflict', shipbubbleOrderId: 'SB-999' })
    const user = userEvent.setup({ delay: null })

    renderDialog()

    await screen.findByRole('radio', { name: /gig standard/i })
    await user.click(screen.getByRole('button', { name: /book & mark shipped/i }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/SB-999/)
  })
})
