import { createRegistry } from '@/services/registry'
import type { PaymentProvider } from './types'

const registry = createRegistry<PaymentProvider>('payment')
export const registerPaymentProvider = (provider: PaymentProvider): void => registry.register(provider)
export const getPaymentProvider = (name: string): PaymentProvider => registry.get(name)
