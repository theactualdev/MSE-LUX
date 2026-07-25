import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { KpiTile } from '@/features/admin/components/kpi-tile'

describe('KpiTile', () => {
  it('renders label and value', () => {
    render(<KpiTile label="Orders" value="12" />)
    expect(screen.getByText('Orders')).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()
  })

  it('renders the optional secondary value and hint', () => {
    render(<KpiTile label="Revenue" value="₦12,500.00" secondary="$300.00" hint="Paid orders" />)
    expect(screen.getByText('$300.00')).toBeInTheDocument()
    expect(screen.getByText('Paid orders')).toBeInTheDocument()
  })
})
