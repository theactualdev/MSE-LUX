import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { ProductStatusBadge } from '@/features/admin/catalog/components/product-status-badge'

describe('ProductStatusBadge', () => {
  it('gives ACTIVE the label "Active" and the default (accent) variant', () => {
    const { getByText } = render(<ProductStatusBadge status="ACTIVE" />)
    const el = getByText('Active')
    expect(el).toBeInTheDocument()
    expect(el.className).toMatch(/bg-primary/)
    expect(el.className).not.toMatch(/bg-secondary/)
  })

  it('gives DRAFT the label "Draft" and the secondary variant, distinct from ACTIVE', () => {
    const { getByText } = render(<ProductStatusBadge status="DRAFT" />)
    const el = getByText('Draft')
    expect(el).toBeInTheDocument()
    expect(el.className).toMatch(/bg-secondary/)
    expect(el.className).not.toMatch(/bg-primary/)
  })
})
