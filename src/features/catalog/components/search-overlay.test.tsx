import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SearchOverlay } from '@/features/catalog/components/search-overlay'
import { searchCatalog } from '@/features/catalog/search-action'
import { useUiStore } from '@/stores/ui'

const push = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('@/features/catalog/search-action', () => ({
  searchCatalog: vi.fn(),
}))

const mockSearchCatalog = vi.mocked(searchCatalog)

const RESULT = {
  slug: 'brass-pendant-necklace',
  name: 'Brass Pendant Necklace, Adire Motif',
  priceSet: {
    ngn: { amountMinor: 1_500_000, currency: 'NGN' as const },
    usd: { amountMinor: 1_900, currency: 'USD' as const },
  },
  image: { src: '/img/brass.jpg', alt: 'Brass pendant necklace' },
}

describe('SearchOverlay', () => {
  beforeEach(() => {
    push.mockClear()
    mockSearchCatalog.mockReset()
    useUiStore.getState().closeAll()
  })

  it('debounces typing into exactly one searchCatalog call, renders results, and Enter routes to the PDP', async () => {
    mockSearchCatalog.mockResolvedValue([RESULT])
    useUiStore.setState({ searchOpen: true })
    const user = userEvent.setup({ delay: null })
    render(<SearchOverlay />)

    // All 5 keystrokes land well inside the 250ms debounce window (delay: null
    // types them back-to-back), so only the settled final value should fire a
    // request.
    await user.type(screen.getByRole('combobox'), 'brass')

    expect(await screen.findByText('Brass Pendant Necklace, Adire Motif')).toBeInTheDocument()
    expect(mockSearchCatalog).toHaveBeenCalledTimes(1)
    expect(mockSearchCatalog).toHaveBeenCalledWith('brass')

    await user.keyboard('{ArrowDown}{Enter}')
    expect(push).toHaveBeenCalledWith('/products/brass-pendant-necklace')
  })

  it('shows a no-results message when the action resolves empty', async () => {
    mockSearchCatalog.mockResolvedValue([])
    useUiStore.setState({ searchOpen: true })
    const user = userEvent.setup({ delay: null })
    render(<SearchOverlay />)

    await user.type(screen.getByRole('combobox'), 'zzzznomatch')
    expect(await screen.findByText(/no results for/i)).toBeInTheDocument()
  })

  it('shows a subtle prompt and never calls searchCatalog when there is no query yet', async () => {
    useUiStore.setState({ searchOpen: true })
    render(<SearchOverlay />)

    expect(screen.getByText(/search jewelry, beads, materials/i)).toBeInTheDocument()

    // Give any (incorrectly-firing) debounce timer a chance to elapse.
    await new Promise((resolve) => setTimeout(resolve, 300))
    expect(mockSearchCatalog).not.toHaveBeenCalled()
  })

  it('recovers into the empty/no-results state instead of crashing when the action rejects', async () => {
    mockSearchCatalog.mockRejectedValue(new Error('boom'))
    useUiStore.setState({ searchOpen: true })
    const user = userEvent.setup({ delay: null })
    render(<SearchOverlay />)

    await user.type(screen.getByRole('combobox'), 'brass')
    expect(await screen.findByText(/no results for/i)).toBeInTheDocument()
  })

  it('renders nothing accessible when closed', () => {
    useUiStore.setState({ searchOpen: false })
    render(<SearchOverlay />)

    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })
})
