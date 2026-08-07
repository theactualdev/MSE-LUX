import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CountrySelect, RegionField } from '@/components/ui/country-region-fields'

describe('CountrySelect', () => {
  it('renders the stored country as the selection', () => {
    render(<CountrySelect id="c" value="Nigeria" onChange={vi.fn()} />)

    expect((screen.getByLabelText('Country') as HTMLSelectElement).value).toBe('Nigeria')
  })

  it('emits the country name, not an ISO code', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<CountrySelect id="c" value="Nigeria" onChange={onChange} />)

    await user.selectOptions(screen.getByLabelText('Country'), 'Ghana')

    // Names are what the address line sends to ShipBubble, and what existing
    // saved addresses hold.
    expect(onChange).toHaveBeenCalledWith('Ghana')
  })

  // The field was free text before this, so stored values may not match the
  // list. A select silently showing (and submitting) the first country in the
  // world would corrupt a real address.
  it('keeps an unrecognised stored country selected instead of silently replacing it', () => {
    render(<CountrySelect id="c" value="Republic of Nowhere" onChange={vi.fn()} />)

    expect((screen.getByLabelText('Country') as HTMLSelectElement).value).toBe('Republic of Nowhere')
  })
})

describe('RegionField', () => {
  it('renders a select of states for Nigeria', () => {
    render(<RegionField id="s" country="Nigeria" value="Lagos" onChange={vi.fn()} />)

    const select = screen.getByLabelText('State') as HTMLSelectElement
    expect(select.tagName).toBe('SELECT')
    expect(select.value).toBe('Lagos')
    expect([...select.options].map((o) => o.value)).toContain('Abuja Federal Capital Territory')
  })

  it('labels the field the way the country does', () => {
    const { unmount } = render(<RegionField id="s" country="Canada" value="" onChange={vi.fn()} />)
    expect(screen.getByLabelText('Province')).toBeInTheDocument()
    unmount()

    render(<RegionField id="s" country="Ghana" value="" onChange={vi.fn()} />)
    expect(screen.getByLabelText('Region')).toBeInTheDocument()
  })

  // Every real country now has a list, so the free-text path is only reached
  // when the country itself cannot be resolved — an address stored before the
  // country select existed. Those must stay editable, not be blocked by a
  // dropdown that cannot contain their region.
  it('falls back to a free-text input when the country cannot be resolved', () => {
    render(<RegionField id="s" country="Republic of Nowhere" value="Somewhere" onChange={vi.fn()} />)

    const field = screen.getByLabelText('State / Region') as HTMLInputElement
    expect(field.tagName).toBe('INPUT')
    expect(field.value).toBe('Somewhere')
  })

  it('renders a dropdown for a country that used to be free text', () => {
    render(<RegionField id="s" country="France" value="" onChange={vi.fn()} />)

    const field = screen.getByLabelText('State / Region') as HTMLSelectElement
    expect(field.tagName).toBe('SELECT')
    expect([...field.options].map((o) => o.value)).toContain('Bretagne')
  })

  it('keeps an unrecognised stored region selectable rather than dropping it', () => {
    render(<RegionField id="s" country="Nigeria" value="Lagos State" onChange={vi.fn()} />)

    expect((screen.getByLabelText('State') as HTMLSelectElement).value).toBe('Lagos State')
  })

  it('emits the chosen region', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<RegionField id="s" country="Nigeria" value="" onChange={onChange} />)

    await user.selectOptions(screen.getByLabelText('State'), 'Kano')

    expect(onChange).toHaveBeenCalledWith('Kano')
  })
})
