import type { Address } from '@/features/checkout/schema'

export type SavedAddress = Address & { id: string; isDefault: boolean }
export interface AccountUser {
  name: string
  email: string
  phone?: string
  addresses: SavedAddress[]
}

function titleCase(s: string): string {
  return s.replace(/[._-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).trim()
}

/** Seed a demo user. Never reads a password. Seeds one default address. */
export function buildMockUser(email: string, name?: string): AccountUser {
  return {
    name: name?.trim() || titleCase(email.split('@')[0] || 'Guest'),
    email,
    addresses: [
      {
        id: 'seed-addr-1', isDefault: true, fullName: name?.trim() || titleCase(email.split('@')[0] || 'Guest'),
        phone: '0800 000 0000', line1: '12 Marina Road', city: 'Lagos', state: 'Lagos', country: 'Nigeria',
      },
    ],
  }
}

export function addAddress(list: SavedAddress[], addr: Address, id: string): SavedAddress[] {
  return [...list, { ...addr, id, isDefault: list.length === 0 }]
}

export function updateAddress(list: SavedAddress[], id: string, patch: Partial<Address>): SavedAddress[] {
  return list.map((a) => (a.id === id ? { ...a, ...patch } : a))
}

export function setDefault(list: SavedAddress[], id: string): SavedAddress[] {
  return list.map((a) => ({ ...a, isDefault: a.id === id }))
}

export function removeAddress(list: SavedAddress[], id: string): SavedAddress[] {
  const next = list.filter((a) => a.id !== id)
  if (next.length > 0 && !next.some((a) => a.isDefault)) next[0] = { ...next[0], isDefault: true }
  return next
}
