// Pure discount arithmetic + shared shapes, directive-free (no `server-only`,
// no `use client`) so BOTH the server discount engine
// (`@/features/discounts/discount`, which re-exports `computeDiscountMinor`
// for its existing importers) and client-rendered checkout components that
// need to preview the SAME number `placeOrder` will charge can import it.
// `discount.ts` carries `server-only` because it also holds `@/lib/db`; this
// module holds nothing but math and types, so it has no such restriction.
// Splitting it out is what lets the checkout preview and the server charge
// share ONE implementation instead of the preview re-deriving the formula
// and risking drift (a rounding step out of step with the server total is
// exactly the bug this split exists to prevent).

import type { Money } from '@/types/money'

/**
 * The discount in minor units. `Math.round` matches every other money
 * calculation in this codebase. Neither the Prisma schema (`percentOff Int`,
 * no CHECK constraint) nor any caller enforces a 1..100 range on `percentOff`,
 * so this function clamps it defensively: below 0 is treated as 0, above 100
 * is treated as 100. That keeps the returned discount within
 * `0..subtotalMinor` and a negative total unreachable, regardless of what a
 * caller passes in. The admin action (a later task) should still validate
 * 1..100 at its own boundary, but that is a UX affordance, not the guarantee
 * — the guarantee lives here.
 */
export function computeDiscountMinor(subtotalMinor: number, percentOff: number): number {
  const clamped = Math.min(100, Math.max(0, percentOff))
  return Math.round((subtotalMinor * clamped) / 100)
}

/**
 * A resolved discount as reported by `DiscountField`/`validateDiscountCode`
 * — a code and a percentage, NEVER a computed amount. `placeOrder` re-derives
 * the amount server-side from the code alone, so this shape is deliberately
 * incapable of carrying a price a caller could tamper with.
 */
export interface AppliedDiscount {
  code: string
  percentOff: number
}

/**
 * An `AppliedDiscount` plus its computed minor-unit amount, as rendered in a
 * totals breakdown (checkout preview, order confirmation, receipt email).
 * `amount` is always `computeDiscountMinor(subtotal, percentOff)` in the
 * summary's own currency — never authored independently of that formula.
 */
export interface DiscountSummary extends AppliedDiscount {
  amount: Money
}
