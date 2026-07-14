import type { Money } from '@/types/money'

export interface ShippingMethod {
  id: string
  label: string
  amount: Money
  estimatedDays?: string
}

// Illustrative mock rates (kobo). Real rates come from ShipBubble in Phase 7.
export const shippingMethods: ShippingMethod[] = [
  { id: 'lagos', label: 'Lagos delivery', amount: { amountMinor: 250_000, currency: 'NGN' }, estimatedDays: '1–2 days' },
  { id: 'nationwide', label: 'Nationwide delivery', amount: { amountMinor: 500_000, currency: 'NGN' }, estimatedDays: '3–5 days' },
  { id: 'international', label: 'International', amount: { amountMinor: 2_000_000, currency: 'NGN' }, estimatedDays: '7–14 days' },
]

export const TAX_RATE = 0.075 // mock VAT
