import { beforeEach, describe, expect, it } from 'vitest'
import { useAuthStore } from '@/features/account/store'

const addr = { fullName: 'A', phone: '080', line1: '1', city: 'L', state: 'L', country: 'Nigeria' }

describe('useAuthStore', () => {
  beforeEach(() => useAuthStore.setState({ user: null }))
  it('signIn seeds a user; signOut clears it', () => {
    useAuthStore.getState().signIn('ada@example.com')
    expect(useAuthStore.getState().user?.email).toBe('ada@example.com')
    useAuthStore.getState().signOut()
    expect(useAuthStore.getState().user).toBeNull()
  })
  it('updateProfile patches the signed-in user', () => {
    useAuthStore.getState().signUp({ name: 'Ada', email: 'a@b.com' })
    useAuthStore.getState().updateProfile({ phone: '0812' })
    expect(useAuthStore.getState().user?.phone).toBe('0812')
  })
  it('address CRUD keeps a single default', () => {
    useAuthStore.getState().signIn('a@b.com')
    useAuthStore.getState().addAddress(addr)
    const list = useAuthStore.getState().user!.addresses
    expect(list.filter((a) => a.isDefault)).toHaveLength(1)
  })
})
