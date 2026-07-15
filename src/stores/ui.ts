import { create } from 'zustand'

interface UiState {
  mobileNavOpen: boolean
  searchOpen: boolean
  cartDrawerOpen: boolean
  openMobileNav: () => void
  closeMobileNav: () => void
  toggleSearch: () => void
  openCartDrawer: () => void
  closeCartDrawer: () => void
  closeAll: () => void
}

export const useUiStore = create<UiState>((set) => ({
  mobileNavOpen: false,
  searchOpen: false,
  cartDrawerOpen: false,
  openMobileNav: () => set({ mobileNavOpen: true }),
  closeMobileNav: () => set({ mobileNavOpen: false }),
  toggleSearch: () => set((s) => ({ searchOpen: !s.searchOpen })),
  openCartDrawer: () => set({ cartDrawerOpen: true }),
  closeCartDrawer: () => set({ cartDrawerOpen: false }),
  closeAll: () => set({ mobileNavOpen: false, searchOpen: false, cartDrawerOpen: false }),
}))
