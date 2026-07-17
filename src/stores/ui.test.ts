import { describe, it, expect, beforeEach } from 'vitest'
import { useUiStore } from '@/stores/ui'

describe('useUiStore', () => {
  beforeEach(() => useUiStore.getState().closeAll())

  it('opens and closes the mobile nav', () => {
    useUiStore.getState().openMobileNav()
    expect(useUiStore.getState().mobileNavOpen).toBe(true)
    useUiStore.getState().closeMobileNav()
    expect(useUiStore.getState().mobileNavOpen).toBe(false)
  })
  it('toggles search', () => {
    useUiStore.getState().toggleSearch()
    expect(useUiStore.getState().searchOpen).toBe(true)
    useUiStore.getState().toggleSearch()
    expect(useUiStore.getState().searchOpen).toBe(false)
  })
  it('closeAll resets everything', () => {
    useUiStore.getState().openMobileNav()
    useUiStore.getState().toggleSearch()
    useUiStore.getState().openCartDrawer()
    useUiStore.getState().closeAll()
    const s = useUiStore.getState()
    expect(s.mobileNavOpen).toBe(false)
    expect(s.searchOpen).toBe(false)
    expect(s.cartDrawerOpen).toBe(false)
  })

  it('opens and closes the cart drawer', () => {
    useUiStore.getState().openCartDrawer()
    expect(useUiStore.getState().cartDrawerOpen).toBe(true)
    useUiStore.getState().closeCartDrawer()
    expect(useUiStore.getState().cartDrawerOpen).toBe(false)
  })

  it('closes search', () => {
    useUiStore.setState({ searchOpen: true })
    useUiStore.getState().closeSearch()
    expect(useUiStore.getState().searchOpen).toBe(false)
  })
})
