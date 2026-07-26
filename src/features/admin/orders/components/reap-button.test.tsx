import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ReapButton } from '@/features/admin/orders/components/reap-button'
import { reapAbandonedOrdersAction } from '@/features/admin/orders/actions'

vi.mock('@/features/admin/orders/actions', () => ({
  reapAbandonedOrdersAction: vi.fn(),
}))

const refreshMock = vi.fn()
vi.mock('next/navigation', async () => {
  const actual = await vi.importActual<typeof import('next/navigation')>('next/navigation')
  return {
    ...actual,
    useRouter: () => ({ refresh: refreshMock, replace: vi.fn(), push: vi.fn() }),
  }
})

const reapAbandonedOrdersActionMock = vi.mocked(reapAbandonedOrdersAction)

describe('ReapButton', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    reapAbandonedOrdersActionMock.mockResolvedValue({ ok: true, reaped: 0 })
  })

  it('renders the trigger button, no dialog open initially', () => {
    render(<ReapButton />)

    expect(screen.getByRole('button', { name: /clean up abandoned orders/i })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(reapAbandonedOrdersActionMock).not.toHaveBeenCalled()
  })

  it('clicking the trigger opens a confirm dialog naming the 24h cutoff', async () => {
    const user = userEvent.setup({ delay: null })
    render(<ReapButton />)

    await user.click(screen.getByRole('button', { name: /clean up abandoned orders/i }))

    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent(/24 hours/i)
    expect(reapAbandonedOrdersActionMock).not.toHaveBeenCalled()
  })

  it('confirming calls reapAbandonedOrdersAction, shows the cancelled count, closes the dialog, and refreshes', async () => {
    reapAbandonedOrdersActionMock.mockResolvedValue({ ok: true, reaped: 3 })
    const user = userEvent.setup({ delay: null })
    render(<ReapButton />)

    await user.click(screen.getByRole('button', { name: /clean up abandoned orders/i }))
    await user.click(screen.getByRole('button', { name: /confirm clean up/i }))

    await vi.waitFor(() => {
      expect(reapAbandonedOrdersActionMock).toHaveBeenCalledTimes(1)
    })
    expect(await screen.findByRole('status')).toHaveTextContent('Cancelled 3 abandoned orders')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(refreshMock).toHaveBeenCalled()
  })

  it('cancelling the dialog does not call the action', async () => {
    const user = userEvent.setup({ delay: null })
    render(<ReapButton />)

    await user.click(screen.getByRole('button', { name: /clean up abandoned orders/i }))
    await user.click(screen.getByRole('button', { name: /^cancel$/i }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(reapAbandonedOrdersActionMock).not.toHaveBeenCalled()
  })

  it('a failure shows an alert inside the still-open dialog and does not refresh', async () => {
    reapAbandonedOrdersActionMock.mockResolvedValue({ ok: false, error: 'forbidden' })
    const user = userEvent.setup({ delay: null })
    render(<ReapButton />)

    await user.click(screen.getByRole('button', { name: /clean up abandoned orders/i }))
    await user.click(screen.getByRole('button', { name: /confirm clean up/i }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/something went wrong/i)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(refreshMock).not.toHaveBeenCalled()
  })
})
