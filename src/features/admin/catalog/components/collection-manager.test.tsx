import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CollectionManager } from '@/features/admin/catalog/components/collection-manager'
import { createCollectionAction, updateCollectionAction, deleteCollectionAction } from '@/features/admin/catalog/actions'
import type { AdminCollectionListItem } from '@/features/admin/catalog/data'

vi.mock('@/features/admin/catalog/actions', () => ({
  createCollectionAction: vi.fn(),
  updateCollectionAction: vi.fn(),
  deleteCollectionAction: vi.fn(),
}))

const refreshMock = vi.fn()
vi.mock('next/navigation', async () => {
  const actual = await vi.importActual<typeof import('next/navigation')>('next/navigation')
  return {
    ...actual,
    useRouter: () => ({ refresh: refreshMock, replace: vi.fn(), push: vi.fn() }),
  }
})

const createCollectionActionMock = vi.mocked(createCollectionAction)
const updateCollectionActionMock = vi.mocked(updateCollectionAction)
const deleteCollectionActionMock = vi.mocked(deleteCollectionAction)

const COLLECTIONS: AdminCollectionListItem[] = [
  { id: 'col-1', name: 'Summer', slug: 'summer', description: 'Summer picks', productCount: 4 },
  { id: 'col-2', name: 'Winter', slug: 'winter', description: null, productCount: 0 },
]

describe('CollectionManager', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    createCollectionActionMock.mockResolvedValue({ ok: true, revalidate: [] })
    updateCollectionActionMock.mockResolvedValue({ ok: true, revalidate: [] })
    deleteCollectionActionMock.mockResolvedValue({ ok: true, revalidate: [] })
  })

  it('lists collections with name, slug, and product count', () => {
    render(<CollectionManager collections={COLLECTIONS} />)

    expect(screen.getByText('Summer')).toBeInTheDocument()
    expect(screen.getByText(/\/summer/)).toBeInTheDocument()
    expect(screen.getByText(/4 products/)).toBeInTheDocument()

    expect(screen.getByText('Winter')).toBeInTheDocument()
    expect(screen.getByText(/\/winter/)).toBeInTheDocument()
    expect(screen.getByText(/0 products/)).toBeInTheDocument()
  })

  it('empty state: no collections yet', () => {
    render(<CollectionManager collections={[]} />)

    expect(screen.getByText(/no collections yet/i)).toBeInTheDocument()
  })

  it('New collection: opens an empty dialog form and creates on submit, then refreshes', async () => {
    const user = userEvent.setup({ delay: null })
    render(<CollectionManager collections={COLLECTIONS} />)

    await user.click(screen.getByRole('button', { name: /new collection/i }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByLabelText(/name/i)).toHaveValue('')
    expect(within(dialog).getByLabelText(/slug/i)).toHaveValue('')
    expect(within(dialog).getByLabelText(/description/i)).toHaveValue('')

    await user.type(within(dialog).getByLabelText(/name/i), '  Spring  ')
    await user.type(within(dialog).getByLabelText(/slug/i), '  spring  ')
    await user.type(within(dialog).getByLabelText(/description/i), '  Fresh picks  ')
    await user.click(within(dialog).getByRole('button', { name: /create collection/i }))

    await vi.waitFor(() => {
      expect(createCollectionActionMock).toHaveBeenCalledWith({
        name: 'Spring',
        slug: 'spring',
        description: 'Fresh picks',
      })
    })
    await vi.waitFor(() => {
      expect(refreshMock).toHaveBeenCalled()
    })
  })

  it('New collection: blank description is submitted as null', async () => {
    const user = userEvent.setup({ delay: null })
    render(<CollectionManager collections={COLLECTIONS} />)

    await user.click(screen.getByRole('button', { name: /new collection/i }))
    const dialog = screen.getByRole('dialog')
    await user.type(within(dialog).getByLabelText(/name/i), 'Spring')
    await user.type(within(dialog).getByLabelText(/slug/i), 'spring')
    await user.click(within(dialog).getByRole('button', { name: /create collection/i }))

    await vi.waitFor(() => {
      expect(createCollectionActionMock).toHaveBeenCalledWith({
        name: 'Spring',
        slug: 'spring',
        description: null,
      })
    })
  })

  it('Edit: opens the same dialog prefilled with the row and updates on submit', async () => {
    const user = userEvent.setup({ delay: null })
    render(<CollectionManager collections={COLLECTIONS} />)

    const summerRow = screen.getByText('Summer').closest('div')!.parentElement!
    await user.click(within(summerRow).getByRole('button', { name: /edit/i }))

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('heading', { name: /edit collection/i })).toBeInTheDocument()
    expect(within(dialog).getByLabelText(/name/i)).toHaveValue('Summer')
    expect(within(dialog).getByLabelText(/slug/i)).toHaveValue('summer')
    expect(within(dialog).getByLabelText(/description/i)).toHaveValue('Summer picks')

    await user.clear(within(dialog).getByLabelText(/name/i))
    await user.type(within(dialog).getByLabelText(/name/i), 'Summer Sale')
    await user.click(within(dialog).getByRole('button', { name: /save changes/i }))

    await vi.waitFor(() => {
      expect(updateCollectionActionMock).toHaveBeenCalledWith('col-1', {
        name: 'Summer Sale',
        slug: 'summer',
        description: 'Summer picks',
      })
    })
    await vi.waitFor(() => {
      expect(refreshMock).toHaveBeenCalled()
    })
  })

  it('Delete: confirm dialog states products are only detached, and confirming deletes + refreshes', async () => {
    const user = userEvent.setup({ delay: null })
    render(<CollectionManager collections={COLLECTIONS} />)

    const summerRow = screen.getByText('Summer').closest('div')!.parentElement!
    await user.click(within(summerRow).getByRole('button', { name: /delete/i }))

    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent(/detached/i)
    expect(dialog).toHaveTextContent(/not deleted/i)

    await user.click(within(dialog).getByRole('button', { name: /confirm delete/i }))

    await vi.waitFor(() => {
      expect(deleteCollectionActionMock).toHaveBeenCalledWith('col-1')
    })
    await vi.waitFor(() => {
      expect(refreshMock).toHaveBeenCalled()
    })
  })

  it('conflict-slug on create renders a slug field error and does not refresh', async () => {
    createCollectionActionMock.mockResolvedValue({ ok: false, error: 'conflict-slug' })
    const user = userEvent.setup({ delay: null })
    render(<CollectionManager collections={COLLECTIONS} />)

    await user.click(screen.getByRole('button', { name: /new collection/i }))
    const dialog = screen.getByRole('dialog')
    await user.type(within(dialog).getByLabelText(/name/i), 'Summer')
    await user.type(within(dialog).getByLabelText(/slug/i), 'summer')
    await user.click(within(dialog).getByRole('button', { name: /create collection/i }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/slug/i)
    expect(refreshMock).not.toHaveBeenCalled()
    expect(dialog).toBeInTheDocument()
  })

  it('generic error on create renders role="alert" and does not refresh', async () => {
    createCollectionActionMock.mockResolvedValue({ ok: false, error: 'error' })
    const user = userEvent.setup({ delay: null })
    render(<CollectionManager collections={COLLECTIONS} />)

    await user.click(screen.getByRole('button', { name: /new collection/i }))
    const dialog = screen.getByRole('dialog')
    await user.type(within(dialog).getByLabelText(/name/i), 'Spring')
    await user.type(within(dialog).getByLabelText(/slug/i), 'spring')
    await user.click(within(dialog).getByRole('button', { name: /create collection/i }))

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(refreshMock).not.toHaveBeenCalled()
  })

  it('forbidden error on delete renders role="alert" and does not refresh', async () => {
    deleteCollectionActionMock.mockResolvedValue({ ok: false, error: 'forbidden' })
    const user = userEvent.setup({ delay: null })
    render(<CollectionManager collections={COLLECTIONS} />)

    const summerRow = screen.getByText('Summer').closest('div')!.parentElement!
    await user.click(within(summerRow).getByRole('button', { name: /delete/i }))
    const dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: /confirm delete/i }))

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(refreshMock).not.toHaveBeenCalled()
  })

  it('invalid-input issues map onto the matching field', async () => {
    createCollectionActionMock.mockResolvedValue({
      ok: false,
      error: 'invalid-input',
      issues: [{ path: ['name'], message: 'Name is required.' } as never],
    })
    const user = userEvent.setup({ delay: null })
    render(<CollectionManager collections={COLLECTIONS} />)

    await user.click(screen.getByRole('button', { name: /new collection/i }))
    const dialog = screen.getByRole('dialog')
    await user.type(within(dialog).getByLabelText(/slug/i), 'spring')
    await user.click(within(dialog).getByRole('button', { name: /create collection/i }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/name is required/i)
    expect(refreshMock).not.toHaveBeenCalled()
  })
})
