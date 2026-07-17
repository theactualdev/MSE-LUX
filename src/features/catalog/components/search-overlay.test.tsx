import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SearchOverlay } from '@/features/catalog/components/search-overlay'
import { useUiStore } from '@/stores/ui'

const push = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}))

describe('SearchOverlay', () => {
  beforeEach(() => {
    push.mockClear()
    useUiStore.getState().closeAll()
  })

  it('typing shows instant results and Enter routes to /search', async () => {
    useUiStore.setState({ searchOpen: true })
    const user = userEvent.setup()
    render(<SearchOverlay />)

    await user.type(screen.getByRole('searchbox'), 'brass')
    // Multiple products match "brass" and the "See all results" link also echoes the
    // query text, so assert on one specific, known result name rather than a loose regex.
    expect(await screen.findByText('Brass Pendant Necklace, Adire Motif')).toBeInTheDocument()

    await user.keyboard('{Enter}')
    expect(push).toHaveBeenCalledWith('/search?q=brass')
  })

  it('shows a no-results message for a query with no matches', async () => {
    useUiStore.setState({ searchOpen: true })
    const user = userEvent.setup()
    render(<SearchOverlay />)

    await user.type(screen.getByRole('searchbox'), 'zzzznomatch')
    expect(await screen.findByText(/no results for/i)).toBeInTheDocument()
  })

  it('shows a subtle prompt when there is no query yet', () => {
    useUiStore.setState({ searchOpen: true })
    render(<SearchOverlay />)

    expect(screen.getByText(/search jewelry, beads, materials/i)).toBeInTheDocument()
  })

  it('renders nothing accessible when closed', () => {
    useUiStore.setState({ searchOpen: false })
    render(<SearchOverlay />)

    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
  })
})
