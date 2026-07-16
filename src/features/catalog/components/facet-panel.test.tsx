import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FacetPanel } from '@/features/catalog/components/facet-panel'
import type { SearchCriteria } from '@/features/catalog/lib/search-params'
import type { FacetCounts } from '@/features/catalog/lib/search'

const replace = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/search',
  useSearchParams: () => new URLSearchParams('q=x'),
}))

const criteria: SearchCriteria = {
  query: 'x',
  categories: [],
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
  categories: {},
  materials: { Brass: 5, Silver: 3 },
  colors: { Turquoise: 4 },
  badges: { new: 2, 'best-seller': 1 },
}

const vocab = {
  materials: ['Brass', 'Silver'],
  colors: ['Turquoise'],
}

describe('FacetPanel', () => {
  beforeEach(() => {
    replace.mockClear()
  })

  it('renders a material option reflecting its count and unchecked state from criteria', () => {
    render(<FacetPanel criteria={criteria} counts={counts} vocab={vocab} />)

    const brass = screen.getByRole('checkbox', { name: /Brass/ })
    expect(brass).not.toBeChecked()
    expect(brass.closest('label')).toHaveTextContent('(5)')
  })

  it('toggling a material updates the URL', async () => {
    const user = userEvent.setup()
    render(<FacetPanel criteria={criteria} counts={counts} vocab={vocab} />)

    await user.click(screen.getByRole('checkbox', { name: /Brass/ }))

    expect(replace).toHaveBeenCalledWith(expect.stringContaining('material=Brass'), { scroll: false })
  })

  it('reflects an already-active material as checked', () => {
    const activeCriteria: SearchCriteria = { ...criteria, materials: ['Brass'] }
    render(<FacetPanel criteria={activeCriteria} counts={counts} vocab={vocab} />)

    expect(screen.getByRole('checkbox', { name: /Brass/ })).toBeChecked()
  })

  it('"Clear all" navigates to the pathname with no query', async () => {
    const user = userEvent.setup()
    const activeCriteria: SearchCriteria = { ...criteria, materials: ['Brass'] }
    render(<FacetPanel criteria={activeCriteria} counts={counts} vocab={vocab} />)

    await user.click(screen.getByRole('button', { name: /clear all/i }))

    expect(replace).toHaveBeenCalledWith('/search', { scroll: false })
  })
})
