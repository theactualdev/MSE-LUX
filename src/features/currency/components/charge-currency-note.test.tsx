import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ChargeCurrencyNote } from './charge-currency-note'

describe('ChargeCurrencyNote', () => {
  it('renders a disclosure for an FX currency', () => {
    render(<ChargeCurrencyNote currency="GBP" />)
    expect(screen.getByText(/charged in/i)).toBeInTheDocument()
  })
  it('renders nothing for authored currencies', () => {
    const { container } = render(<ChargeCurrencyNote currency="NGN" />)
    expect(container).toBeEmptyDOMElement()
  })
})
