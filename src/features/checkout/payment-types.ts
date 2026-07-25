/**
 * Result types for the payment server actions (`payments.ts`). Kept in a
 * sibling non-directive module — same reasoning as `types.ts` next to
 * `data.ts` — so they can be imported by both server and client code without
 * dragging the `'use server'` directive along.
 */

export type InitializePaymentResult = { ok: true; accessCode: string; publicKey: string } | { error: string }

export type VerifyPaymentResult = { ok: true; status: 'paid' | 'processing' } | { error: string }
