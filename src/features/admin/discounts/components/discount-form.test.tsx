import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DiscountFormDialog } from '@/features/admin/discounts/components/discount-form'
import { createDiscountAction, updateDiscountAction } from '@/features/admin/discounts/actions'

const refresh = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}))

vi.mock('@/features/admin/discounts/actions', () => ({
  createDiscountAction: vi.fn(),
  updateDiscountAction: vi.fn(),
  setDiscountActiveAction: vi.fn(),
}))

const createDiscountActionMock = vi.mocked(createDiscountAction)
const updateDiscountActionMock = vi.mocked(updateDiscountAction)

async function openNewDiscountDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /new discount/i }))
  await screen.findByRole('dialog')
}

describe('DiscountFormDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("stores expiresAt at the END of the chosen day (T23:59:59.999Z), not its start — the stated date stays usable through its last hour", async () => {
    const user = userEvent.setup({ delay: null })
    createDiscountActionMock.mockResolvedValue({ ok: true })

    render(<DiscountFormDialog />)
    await openNewDiscountDialog(user)

    await user.type(screen.getByLabelText('Code'), 'LAUNCH20')
    await user.type(screen.getByLabelText(/percent off/i), '20')
    await user.type(screen.getByLabelText(/expires/i), '2026-08-05')
    await user.click(screen.getByRole('button', { name: /create code/i }))

    await waitFor(() => expect(createDiscountActionMock).toHaveBeenCalledTimes(1))
    const call = createDiscountActionMock.mock.calls[0][0] as { expiresAt: Date }
    expect(call.expiresAt.toISOString()).toBe('2026-08-05T23:59:59.999Z')
  })

  it('resets to empty fields after a successful create, so reopening "New discount" is not prefilled with the code just created', async () => {
    const user = userEvent.setup({ delay: null })
    createDiscountActionMock.mockResolvedValue({ ok: true })

    render(<DiscountFormDialog />)
    await openNewDiscountDialog(user)

    await user.type(screen.getByLabelText('Code'), 'LAUNCH20')
    await user.type(screen.getByLabelText(/percent off/i), '20')
    await user.click(screen.getByRole('button', { name: /create code/i }))

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1))
    // The dialog closes on success (unmounting its content) — same portal-
    // based Base UI dialog `book-shipment-dialog.test.tsx` relies on.
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    await openNewDiscountDialog(user)

    expect(screen.getByLabelText('Code')).toHaveValue('')
    expect(screen.getByLabelText(/percent off/i)).toHaveValue(null)
  })

  it('resets fields when Cancel is clicked, not just when the dialog is dismissed some other way', async () => {
    const user = userEvent.setup({ delay: null })

    render(<DiscountFormDialog />)
    await openNewDiscountDialog(user)

    await user.type(screen.getByLabelText('Code'), 'LAUNCH20')
    await user.click(screen.getByRole('button', { name: /cancel/i }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    await openNewDiscountDialog(user)
    expect(screen.getByLabelText('Code')).toHaveValue('')
  })

  it('edit mode: parses the expires input to the end of the chosen day too', async () => {
    const user = userEvent.setup({ delay: null })
    updateDiscountActionMock.mockResolvedValue({ ok: true })

    render(
      <DiscountFormDialog
        discount={{ id: 'd1', code: 'LAUNCH20', percentOff: 20, active: true, expiresAt: null, maxUses: null, timesUsed: 0 }}
      />,
    )
    await user.click(screen.getByRole('button', { name: /^edit$/i }))
    await screen.findByRole('dialog')

    const expiresInput = screen.getByLabelText(/expires/i)
    await user.clear(expiresInput)
    await user.type(expiresInput, '2026-12-25')
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() => expect(updateDiscountActionMock).toHaveBeenCalledTimes(1))
    const call = updateDiscountActionMock.mock.calls[0][0] as { expiresAt: Date }
    expect(call.expiresAt.toISOString()).toBe('2026-12-25T23:59:59.999Z')
  })
})
