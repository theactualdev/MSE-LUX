/**
 * `@paystack/inline-js` ships no type declarations (plain JS `lib`/`es`
 * builds, README-only docs — see `node_modules/@paystack/inline-js/README.md`
 * for the verified API). This covers only what `checkout-flow.tsx` actually
 * uses: resuming a server-initialized transaction by access code and
 * reacting to its outcome.
 */
declare module '@paystack/inline-js' {
  interface PaystackSuccessTransaction {
    id: number
    reference: string
    message: string
  }

  interface PaystackErrorInfo {
    message: string
  }

  interface ResumeTransactionCallbacks {
    onSuccess?: (transaction: PaystackSuccessTransaction) => void
    onCancel?: () => void
    onError?: (error: PaystackErrorInfo) => void
    onLoad?: (transaction: { id: number; customer: unknown; accessCode: string }) => void
  }

  export default class PaystackPop {
    constructor()
    resumeTransaction(accessCode: string, callbacks: ResumeTransactionCallbacks): void
  }
}
