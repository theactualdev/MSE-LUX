import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OrderActions } from '@/features/admin/orders/components/order-actions'
import { shipOrderAction, deliverOrderAction, cancelOrderAction, markOrderRefundedAction } from '@/features/admin/orders/actions'

vi.mock('@/features/admin/orders/actions', () => ({
  shipOrderAction: vi.fn(),
  deliverOrderAction: vi.fn(),
  cancelOrderAction: vi.fn(),
  markOrderRefundedAction: vi.fn(),
  getBookingRatesAction: vi.fn(),
  bookShipmentAction: vi.fn(),
}))

const refreshMock = vi.fn()
vi.mock('next/navigation', async () => {
  const actual = await vi.importActual<typeof import('next/navigation')>('next/navigation')
  return {
    ...actual,
    useRouter: () => ({ refresh: refreshMock, replace: vi.fn(), push: vi.fn() }),
  }
})

const shipOrderActionMock = vi.mocked(shipOrderAction)
const deliverOrderActionMock = vi.mocked(deliverOrderAction)
const cancelOrderActionMock = vi.mocked(cancelOrderAction)
const markOrderRefundedActionMock = vi.mocked(markOrderRefundedAction)

const PAID_SHIPPING = { amountMinor: 250_000, currency: 'NGN', label: 'Standard' }

describe('OrderActions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    shipOrderActionMock.mockResolvedValue({ ok: true })
    deliverOrderActionMock.mockResolvedValue({ ok: true })
    cancelOrderActionMock.mockResolvedValue({ ok: true })
    markOrderRefundedActionMock.mockResolvedValue({ ok: true })
  })

  it('PROCESSING + Nigeria: shows Book shipment, Enter tracking manually, and Cancel order', () => {
    render(
      <OrderActions
        orderNumber="MSE-1"
        status="PROCESSING"
        nigeria={true}
        refundOwed={false}
        refundedAt={null}
        refundReference={null}
        paystackReference={null}
        paidShipping={PAID_SHIPPING}
      />,
    )

    expect(screen.getByRole('button', { name: /book shipment/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /enter tracking manually/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /cancel order/i })).toBeInTheDocument()
  })

  it('PROCESSING + not Nigeria: no Book shipment button', () => {
    render(
      <OrderActions
        orderNumber="MSE-1"
        status="PROCESSING"
        nigeria={false}
        refundOwed={false}
        refundedAt={null}
        refundReference={null}
        paystackReference={null}
        paidShipping={PAID_SHIPPING}
      />,
    )

    expect(screen.queryByRole('button', { name: /book shipment/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /enter tracking manually/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /cancel order/i })).toBeInTheDocument()
  })

  it('SHIPPED: only Mark delivered', () => {
    render(
      <OrderActions
        orderNumber="MSE-1"
        status="SHIPPED"
        nigeria={true}
        refundOwed={false}
        refundedAt={null}
        refundReference={null}
        paystackReference={null}
        paidShipping={PAID_SHIPPING}
      />,
    )

    expect(screen.getByRole('button', { name: /mark delivered/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /book shipment/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /enter tracking manually/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /cancel order/i })).not.toBeInTheDocument()
  })

  it('PENDING: only Cancel order', () => {
    render(
      <OrderActions
        orderNumber="MSE-1"
        status="PENDING"
        nigeria={true}
        refundOwed={false}
        refundedAt={null}
        refundReference={null}
        paystackReference={null}
        paidShipping={PAID_SHIPPING}
      />,
    )

    expect(screen.getByRole('button', { name: /cancel order/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /book shipment/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /enter tracking manually/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /mark delivered/i })).not.toBeInTheDocument()
  })

  it('DELIVERED: no action buttons', () => {
    render(
      <OrderActions
        orderNumber="MSE-1"
        status="DELIVERED"
        nigeria={true}
        refundOwed={false}
        refundedAt={null}
        refundReference={null}
        paystackReference={null}
        paidShipping={PAID_SHIPPING}
      />,
    )

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('CANCELLED without refund owed: no action buttons, no refund notice', () => {
    render(
      <OrderActions
        orderNumber="MSE-1"
        status="CANCELLED"
        nigeria={true}
        refundOwed={false}
        refundedAt={null}
        refundReference={null}
        paystackReference={null}
        paidShipping={PAID_SHIPPING}
      />,
    )

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByText(/refund owed/i)).not.toBeInTheDocument()
  })

  it('CANCELLED with refund owed and unrecorded: shows the Paystack reference and a Mark refunded button', () => {
    render(
      <OrderActions
        orderNumber="MSE-1"
        status="CANCELLED"
        nigeria={true}
        refundOwed={true}
        refundedAt={null}
        refundReference={null}
        paystackReference="ps_ref_123"
        paidShipping={PAID_SHIPPING}
      />,
    )

    expect(screen.getByText(/find this charge in paystack: ps_ref_123/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /mark refunded/i })).toBeInTheDocument()
  })

  it('CANCELLED with refund owed but no stored Paystack reference: falls back to an em dash', () => {
    render(
      <OrderActions
        orderNumber="MSE-1"
        status="CANCELLED"
        nigeria={true}
        refundOwed={true}
        refundedAt={null}
        refundReference={null}
        paystackReference={null}
        paidShipping={PAID_SHIPPING}
      />,
    )

    expect(screen.getByText(/find this charge in paystack: —/i)).toBeInTheDocument()
  })

  it('CANCELLED with refundedAt set: neutral refunded line, no action buttons', () => {
    render(
      <OrderActions
        orderNumber="MSE-1"
        status="CANCELLED"
        nigeria={true}
        refundOwed={false}
        refundedAt="2026-07-22T09:00:00.000Z"
        refundReference="RF-1"
        paystackReference="ps_ref_123"
        paidShipping={PAID_SHIPPING}
      />,
    )

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getByText(/refunded/i)).toBeInTheDocument()
    expect(screen.getByText(/ref RF-1/i)).toBeInTheDocument()
  })

  it('CANCELLED with refundedAt set and no stored reference: shows an em dash for the reference', () => {
    render(
      <OrderActions
        orderNumber="MSE-1"
        status="CANCELLED"
        nigeria={true}
        refundOwed={false}
        refundedAt="2026-07-22T09:00:00.000Z"
        refundReference={null}
        paystackReference={null}
        paidShipping={PAID_SHIPPING}
      />,
    )

    expect(screen.getByText(/ref —/i)).toBeInTheDocument()
  })

  it('mark refunded: opening the dialog restates the dashboard-first flow and lets the reference be entered', async () => {
    const user = userEvent.setup({ delay: null })
    render(
      <OrderActions
        orderNumber="MSE-1"
        status="CANCELLED"
        nigeria={true}
        refundOwed={true}
        refundedAt={null}
        refundReference={null}
        paystackReference="ps_ref_123"
        paidShipping={PAID_SHIPPING}
      />,
    )

    await user.click(screen.getByRole('button', { name: /mark refunded/i }))
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent(/paystack dashboard/i)
    expect(within(dialog).getByLabelText(/reference/i)).toBeInTheDocument()
  })

  it('mark refunded: confirming with an entered reference calls markOrderRefundedAction and refreshes', async () => {
    const user = userEvent.setup({ delay: null })
    render(
      <OrderActions
        orderNumber="MSE-1"
        status="CANCELLED"
        nigeria={true}
        refundOwed={true}
        refundedAt={null}
        refundReference={null}
        paystackReference="ps_ref_123"
        paidShipping={PAID_SHIPPING}
      />,
    )

    await user.click(screen.getByRole('button', { name: /mark refunded/i }))
    const dialog = screen.getByRole('dialog')
    await user.type(within(dialog).getByLabelText(/reference/i), '  RF-2  ')
    await user.click(within(dialog).getByRole('button', { name: /confirm mark refunded/i }))

    await vi.waitFor(() => {
      expect(markOrderRefundedActionMock).toHaveBeenCalledWith('MSE-1', { reference: 'RF-2' })
    })
    await vi.waitFor(() => {
      expect(refreshMock).toHaveBeenCalled()
    })
  })

  it('mark refunded: confirming with a blank reference calls markOrderRefundedAction with no reference key', async () => {
    const user = userEvent.setup({ delay: null })
    render(
      <OrderActions
        orderNumber="MSE-1"
        status="CANCELLED"
        nigeria={true}
        refundOwed={true}
        refundedAt={null}
        refundReference={null}
        paystackReference="ps_ref_123"
        paidShipping={PAID_SHIPPING}
      />,
    )

    await user.click(screen.getByRole('button', { name: /mark refunded/i }))
    const dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: /confirm mark refunded/i }))

    await vi.waitFor(() => {
      expect(markOrderRefundedActionMock).toHaveBeenCalledWith('MSE-1', {})
    })
    await vi.waitFor(() => {
      expect(refreshMock).toHaveBeenCalled()
    })
  })

  it('mark refunded: a conflict result shows an alert and does not refresh', async () => {
    markOrderRefundedActionMock.mockResolvedValue({ ok: false, error: 'conflict' })
    const user = userEvent.setup({ delay: null })
    render(
      <OrderActions
        orderNumber="MSE-1"
        status="CANCELLED"
        nigeria={true}
        refundOwed={true}
        refundedAt={null}
        refundReference={null}
        paystackReference="ps_ref_123"
        paidShipping={PAID_SHIPPING}
      />,
    )

    await user.click(screen.getByRole('button', { name: /mark refunded/i }))
    const dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: /confirm mark refunded/i }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/already recorded — refresh the page/i)
    expect(refreshMock).not.toHaveBeenCalled()
  })

  it('manual tracking: submitting trimmed carrier + tracking number calls shipOrderAction and refreshes', async () => {
    const user = userEvent.setup({ delay: null })
    render(
      <OrderActions
        orderNumber="MSE-1"
        status="PROCESSING"
        nigeria={true}
        refundOwed={false}
        refundedAt={null}
        refundReference={null}
        paystackReference={null}
        paidShipping={PAID_SHIPPING}
      />,
    )

    await user.click(screen.getByRole('button', { name: /enter tracking manually/i }))
    await user.type(screen.getByLabelText(/carrier/i), '  DHL  ')
    await user.type(screen.getByLabelText(/tracking number/i), '  ABC123  ')
    await user.click(screen.getByRole('button', { name: /mark shipped/i }))

    await vi.waitFor(() => {
      expect(shipOrderActionMock).toHaveBeenCalledWith('MSE-1', { carrier: 'DHL', trackingNumber: 'ABC123' })
    })
    await vi.waitFor(() => {
      expect(refreshMock).toHaveBeenCalled()
    })
  })

  it('manual tracking: blank submit shows inline validation and never calls the action', async () => {
    const user = userEvent.setup({ delay: null })
    render(
      <OrderActions
        orderNumber="MSE-1"
        status="PROCESSING"
        nigeria={true}
        refundOwed={false}
        refundedAt={null}
        refundReference={null}
        paystackReference={null}
        paidShipping={PAID_SHIPPING}
      />,
    )

    await user.click(screen.getByRole('button', { name: /enter tracking manually/i }))
    await user.click(screen.getByRole('button', { name: /mark shipped/i }))

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(shipOrderActionMock).not.toHaveBeenCalled()
    expect(refreshMock).not.toHaveBeenCalled()
  })

  it('cancel: PROCESSING confirm dialog mentions restock and refund', async () => {
    const user = userEvent.setup({ delay: null })
    render(
      <OrderActions
        orderNumber="MSE-1"
        status="PROCESSING"
        nigeria={true}
        refundOwed={false}
        refundedAt={null}
        refundReference={null}
        paystackReference={null}
        paidShipping={PAID_SHIPPING}
      />,
    )

    await user.click(screen.getByRole('button', { name: /cancel order/i }))
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent(/restock/i)
    expect(dialog).toHaveTextContent(/refund/i)
  })

  it('cancel: PENDING confirm dialog mentions neither restock nor refund', async () => {
    const user = userEvent.setup({ delay: null })
    render(
      <OrderActions
        orderNumber="MSE-1"
        status="PENDING"
        nigeria={true}
        refundOwed={false}
        refundedAt={null}
        refundReference={null}
        paystackReference={null}
        paidShipping={PAID_SHIPPING}
      />,
    )

    await user.click(screen.getByRole('button', { name: /cancel order/i }))
    const dialog = screen.getByRole('dialog')
    expect(dialog).not.toHaveTextContent(/restock/i)
    expect(dialog).not.toHaveTextContent(/refund/i)
  })

  it('cancel: confirming calls cancelOrderAction and refreshes', async () => {
    const user = userEvent.setup({ delay: null })
    render(
      <OrderActions
        orderNumber="MSE-1"
        status="PROCESSING"
        nigeria={true}
        refundOwed={false}
        refundedAt={null}
        refundReference={null}
        paystackReference={null}
        paidShipping={PAID_SHIPPING}
      />,
    )

    await user.click(screen.getByRole('button', { name: /cancel order/i }))
    const dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: /confirm cancel/i }))

    await vi.waitFor(() => {
      expect(cancelOrderActionMock).toHaveBeenCalledWith('MSE-1')
    })
    await vi.waitFor(() => {
      expect(refreshMock).toHaveBeenCalled()
    })
  })

  it('cancel: a conflict result shows an alert and does not refresh', async () => {
    cancelOrderActionMock.mockResolvedValue({ ok: false, error: 'conflict' })
    const user = userEvent.setup({ delay: null })
    render(
      <OrderActions
        orderNumber="MSE-1"
        status="PROCESSING"
        nigeria={true}
        refundOwed={false}
        refundedAt={null}
        refundReference={null}
        paystackReference={null}
        paidShipping={PAID_SHIPPING}
      />,
    )

    await user.click(screen.getByRole('button', { name: /cancel order/i }))
    const dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: /confirm cancel/i }))

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(refreshMock).not.toHaveBeenCalled()
  })

  it('deliver: clicking Mark delivered calls deliverOrderAction and refreshes', async () => {
    const user = userEvent.setup({ delay: null })
    render(
      <OrderActions
        orderNumber="MSE-1"
        status="SHIPPED"
        nigeria={true}
        refundOwed={false}
        refundedAt={null}
        refundReference={null}
        paystackReference={null}
        paidShipping={PAID_SHIPPING}
      />,
    )

    await user.click(screen.getByRole('button', { name: /mark delivered/i }))

    await vi.waitFor(() => {
      expect(deliverOrderActionMock).toHaveBeenCalledWith('MSE-1')
    })
    await vi.waitFor(() => {
      expect(refreshMock).toHaveBeenCalled()
    })
  })
})
