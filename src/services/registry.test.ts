import { describe, it, expect } from 'vitest'
import { registerPaymentProvider, getPaymentProvider } from '@/services/payments/registry'
import type { PaymentProvider } from '@/services/payments/types'

const fake: PaymentProvider = {
  name: 'fake',
  async initializePayment() { return { providerRef: 'r1', authorizationUrl: 'https://x' } },
  async verifyPayment() {
    return { providerRef: 'r1', status: 'success', amount: { amountMinor: 100, currency: 'USD' } }
  },
}

describe('payment provider registry', () => {
  it('returns a registered provider', () => {
    registerPaymentProvider(fake)
    expect(getPaymentProvider('fake')).toBe(fake)
  })
  it('throws for an unknown provider', () => {
    expect(() => getPaymentProvider('nope')).toThrow(/No payment provider/)
  })
})
