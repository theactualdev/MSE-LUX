import { createRegistry } from '@/services/registry'
import type { EmailProvider } from './types'

const registry = createRegistry<EmailProvider>('email')
export const registerEmailProvider = (provider: EmailProvider): void => registry.register(provider)
export const getEmailProvider = (name: string): EmailProvider => registry.get(name)
