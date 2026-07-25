import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { StatusBadge } from '@/features/admin/orders/components/status-badge'

describe('StatusBadge', () => {
  it('title-cases the status label, e.g. PROCESSING -> Processing', () => {
    const { getByText } = render(<StatusBadge status="PROCESSING" />)
    expect(getByText('Processing')).toBeInTheDocument()
  })

  it('gives DELIVERED the default (accent) variant and CANCELLED the destructive variant', () => {
    const { getByText: getDelivered, unmount } = render(<StatusBadge status="DELIVERED" />)
    const deliveredEl = getDelivered('Delivered')
    expect(deliveredEl.className).toMatch(/bg-primary/)
    expect(deliveredEl.className).not.toMatch(/bg-destructive/)
    unmount()

    const { getByText: getCancelled } = render(<StatusBadge status="CANCELLED" />)
    const cancelledEl = getCancelled('Cancelled')
    expect(cancelledEl.className).toMatch(/bg-destructive/)
    expect(cancelledEl.className).not.toMatch(/bg-primary/)
  })

  it('gives other statuses (PENDING, SHIPPED) the secondary variant, distinct from DELIVERED/CANCELLED', () => {
    const { getByText: getPending, unmount } = render(<StatusBadge status="PENDING" />)
    const pendingEl = getPending('Pending')
    expect(pendingEl.className).toMatch(/bg-secondary/)
    unmount()

    const { getByText: getShipped } = render(<StatusBadge status="SHIPPED" />)
    const shippedEl = getShipped('Shipped')
    expect(shippedEl.className).toMatch(/bg-secondary/)
  })
})
