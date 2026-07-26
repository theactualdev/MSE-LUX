import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DangerZone } from '@/features/admin/catalog/components/danger-zone'
import { archiveProductAction, restoreProductAction, deleteProductAction } from '@/features/admin/catalog/actions'

vi.mock('@/features/admin/catalog/actions', () => ({
  archiveProductAction: vi.fn(),
  restoreProductAction: vi.fn(),
  deleteProductAction: vi.fn(),
}))

const refreshMock = vi.fn()
const pushMock = vi.fn()
vi.mock('next/navigation', async () => {
  const actual = await vi.importActual<typeof import('next/navigation')>('next/navigation')
  return {
    ...actual,
    useRouter: () => ({ refresh: refreshMock, replace: vi.fn(), push: pushMock }),
  }
})

const archiveProductActionMock = vi.mocked(archiveProductAction)
const restoreProductActionMock = vi.mocked(restoreProductAction)
const deleteProductActionMock = vi.mocked(deleteProductAction)

describe('DangerZone', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    archiveProductActionMock.mockResolvedValue({ ok: true, revalidate: [] })
    restoreProductActionMock.mockResolvedValue({ ok: true, revalidate: [] })
    deleteProductActionMock.mockResolvedValue({ ok: true, revalidate: [] })
  })

  it('no order lines: shows a Delete button, no archive/restore button', () => {
    render(<DangerZone productId="prod-1" productName="Diamond Tennis Bracelet" status="ACTIVE" hasOrderLines={false} />)

    expect(screen.getByRole('button', { name: /delete product/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /archive product/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /restore product/i })).not.toBeInTheDocument()
  })

  it('no order lines: clicking Delete opens a confirm dialog naming the product', async () => {
    const user = userEvent.setup({ delay: null })
    render(<DangerZone productId="prod-1" productName="Diamond Tennis Bracelet" status="ACTIVE" hasOrderLines={false} />)

    await user.click(screen.getByRole('button', { name: /delete product/i }))

    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent('Diamond Tennis Bracelet')
  })

  it('no order lines: confirming delete calls deleteProductAction and routes to /admin/catalog', async () => {
    const user = userEvent.setup({ delay: null })
    render(<DangerZone productId="prod-1" productName="Diamond Tennis Bracelet" status="ACTIVE" hasOrderLines={false} />)

    await user.click(screen.getByRole('button', { name: /delete product/i }))
    const dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: /confirm delete/i }))

    await vi.waitFor(() => {
      expect(deleteProductActionMock).toHaveBeenCalledWith('prod-1')
    })
    await vi.waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith('/admin/catalog')
    })
  })

  it('no order lines: a failed delete shows an alert inside the dialog and does not navigate', async () => {
    deleteProductActionMock.mockResolvedValue({ ok: false, error: 'error' })
    const user = userEvent.setup({ delay: null })
    render(<DangerZone productId="prod-1" productName="Diamond Tennis Bracelet" status="ACTIVE" hasOrderLines={false} />)

    await user.click(screen.getByRole('button', { name: /delete product/i }))
    const dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: /confirm delete/i }))

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(pushMock).not.toHaveBeenCalled()
  })

  it('has order lines + ACTIVE: no Delete button, an explanatory line, an Archive button', () => {
    render(<DangerZone productId="prod-1" productName="Diamond Tennis Bracelet" status="ACTIVE" hasOrderLines={true} />)

    expect(screen.queryByRole('button', { name: /delete product/i })).not.toBeInTheDocument()
    expect(screen.getByText(/can't be deleted/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /archive product/i })).toBeInTheDocument()
  })

  it('has order lines + DRAFT: shows a Restore button instead of Archive', () => {
    render(<DangerZone productId="prod-1" productName="Diamond Tennis Bracelet" status="DRAFT" hasOrderLines={true} />)

    expect(screen.getByRole('button', { name: /restore product/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /archive product/i })).not.toBeInTheDocument()
  })

  it('has order lines: clicking Archive calls archiveProductAction and refreshes', async () => {
    const user = userEvent.setup({ delay: null })
    render(<DangerZone productId="prod-1" productName="Diamond Tennis Bracelet" status="ACTIVE" hasOrderLines={true} />)

    await user.click(screen.getByRole('button', { name: /archive product/i }))

    await vi.waitFor(() => {
      expect(archiveProductActionMock).toHaveBeenCalledWith('prod-1')
    })
    await vi.waitFor(() => {
      expect(refreshMock).toHaveBeenCalled()
    })
  })

  it('has order lines: clicking Restore calls restoreProductAction and refreshes', async () => {
    const user = userEvent.setup({ delay: null })
    render(<DangerZone productId="prod-1" productName="Diamond Tennis Bracelet" status="DRAFT" hasOrderLines={true} />)

    await user.click(screen.getByRole('button', { name: /restore product/i }))

    await vi.waitFor(() => {
      expect(restoreProductActionMock).toHaveBeenCalledWith('prod-1')
    })
    await vi.waitFor(() => {
      expect(refreshMock).toHaveBeenCalled()
    })
  })

  it('has order lines: a failed archive shows an alert and does not refresh', async () => {
    archiveProductActionMock.mockResolvedValue({ ok: false, error: 'conflict' })
    const user = userEvent.setup({ delay: null })
    render(<DangerZone productId="prod-1" productName="Diamond Tennis Bracelet" status="ACTIVE" hasOrderLines={true} />)

    await user.click(screen.getByRole('button', { name: /archive product/i }))

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(refreshMock).not.toHaveBeenCalled()
  })
})
