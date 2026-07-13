import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MobileDrawer } from '@/components/layout/mobile-drawer'
import { useUiStore } from '@/stores/ui'

describe('MobileDrawer', () => {
  beforeEach(() => useUiStore.getState().closeAll())
  it('is hidden by default and shown when the store opens it', () => {
    const { rerender } = render(<MobileDrawer />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    useUiStore.getState().openMobileNav()
    rerender(<MobileDrawer />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})
