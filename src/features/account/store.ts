import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { Address } from '@/features/checkout/schema'
import {
  addAddress as addAddr, buildMockUser, removeAddress as rmAddr,
  setDefault, updateAddress as updAddr, type AccountUser,
} from '@/features/account/lib/mock-user'

interface AuthState {
  user: AccountUser | null
  signIn: (email: string) => void
  signUp: (input: { name: string; email: string }) => void
  signOut: () => void
  updateProfile: (patch: Partial<Pick<AccountUser, 'name' | 'email' | 'phone'>>) => void
  addAddress: (addr: Address) => void
  updateAddress: (id: string, patch: Partial<Address>) => void
  removeAddress: (id: string) => void
  setDefaultAddress: (id: string) => void
}

let addrSeq = 0
const nextAddrId = () => `addr-${++addrSeq}-${Math.round(Math.random() * 1e6)}`

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      signIn: (email) => set({ user: buildMockUser(email) }),
      signUp: ({ name, email }) => set({ user: buildMockUser(email, name) }),
      signOut: () => set({ user: null }),
      updateProfile: (patch) => set((s) => (s.user ? { user: { ...s.user, ...patch } } : s)),
      addAddress: (addr) => set((s) => (s.user ? { user: { ...s.user, addresses: addAddr(s.user.addresses, addr, nextAddrId()) } } : s)),
      updateAddress: (id, patch) => set((s) => (s.user ? { user: { ...s.user, addresses: updAddr(s.user.addresses, id, patch) } } : s)),
      removeAddress: (id) => set((s) => (s.user ? { user: { ...s.user, addresses: rmAddr(s.user.addresses, id) } } : s)),
      setDefaultAddress: (id) => set((s) => (s.user ? { user: { ...s.user, addresses: setDefault(s.user.addresses, id) } } : s)),
    }),
    { name: 'mselux-auth', storage: createJSONStorage(() => localStorage) },
  ),
)
