import type { Money } from '@/types/money'

export interface PaymentInitInput {
  orderRef: string
  amount: Money
  customerEmail: string
}
export interface PaymentInitResult {
  providerRef: string
  authorizationUrl: string
}
export interface PaymentVerification {
  providerRef: string
  status: 'success' | 'failed' | 'pending'
  amount: Money
}
export interface PaymentProvider {
  readonly name: string
  initializePayment(input: PaymentInitInput): Promise<PaymentInitResult>
  verifyPayment(providerRef: string): Promise<PaymentVerification>
}
