import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ActiveFilterChips } from '@/features/catalog/components/active-filter-chips'
import type { SearchCriteria } from '@/features/catalog/lib/search-params'
import type { FacetCounts } from '@/features/catalog/lib/search'

const replace = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/rings',
  useSearchParams: () => new URLSearchParams('category=rings'),
}))

const criteria: SearchCriteria = {
  query: '',
  categories: ['rings'],
  subcategory: undefined,
  materials: [],
  colors: [],
  badges: [],
  priceMin: undefined,
  priceMax: undefined,
  inStock: false,
  sort: 'newest',
}

const counts: FacetCounts = {
  categories: { rings: 12 },
  materials: {},
  colors: {},
  badges: {},
}

const vocab = {
  materials: [],
  colors: [],
  categories: [{ slug: 'rings', name: 'Rings' }],
}

describe('ActiveFilterChips', () => {
  beforeEach(() => {
    replace.mockClear()
  })

  it('does not render a "Remove filter" control for a route-forced category when show.category is false', () => {
    render(
      <ActiveFilterChips criteria={criteria} counts={counts} vocab={vocab} show={{ category: false }} />,
    )

    expect(screen.queryByRole('button', { name: /Remove filter Rings/i })).not.toBeInTheDocument()
  })

  it('renders a removable category chip when show.category is not false (e.g. on /search)', async () => {
    const user = userEvent.setup()
    render(<ActiveFilterChips criteria={criteria} counts={counts} vocab={vocab} show={{ category: true }} />)

    const chip = screen.getByRole('button', { name: /Remove filter Rings/i })
    expect(chip).toBeInTheDocument()

    await user.click(chip)
    expect(replace).toHaveBeenCalledWith('/rings', { scroll: false })
  })
})
