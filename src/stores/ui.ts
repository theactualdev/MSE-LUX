import { create } from 'zustand'

interface UiState {
  mobileNavOpen: boolean
  searchOpen: boolean
  openMobileNav: () => void
  closeMobileNav: () => void
  toggleSearch: () => void
  closeAll: () => void
}

export const useUiStore = create<UiState>((set) => ({
  mobileNavOpen: false,
  searchOpen: false,
  openMobileNav: () => set({ mobileNavOpen: true }),
  closeMobileNav: () => set({ mobileNavOpen: false }),
  toggleSearch: () => set((s) => ({ searchOpen: !s.searchOpen })),
  closeAll: () => set({ mobileNavOpen: false, searchOpen: false }),
}))
