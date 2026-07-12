import { createRegistry } from '@/services/registry'
import type { ShippingProvider } from './types'

const registry = createRegistry<ShippingProvider>('shipping')
export const registerShippingProvider = (provider: ShippingProvider): void => registry.register(provider)
export const getShippingProvider = (name: string): ShippingProvider => registry.get(name)
