import 'server-only'

import { db } from '@/lib/db'

/**
 * Discount engine (Phase 10b). Directive-free so both the public
 * `validateDiscountCode` action and `placeOrder` can call it; `server-only`
 * because it holds `@/lib/db`.
 *
 * `resolveUsableCode` returns the SAME null for unknown, inactive, expired,
 * exhausted, AND out-of-range (`percentOff` outside 1..100) codes. The caller
 * renders one generic message from that null — a message distinguishing the
 * cases would confirm which codes exist.
 *
 * Neither the Prisma schema (`percentOff Int`, no CHECK constraint) nor any
 * caller enforces the 1..100 bound on `percentOff` — the admin action that
 * would validate it at write time is a future task and does not exist yet.
 * So this module enforces the bound itself, in both directions:
 * `resolveUsableCode` refuses to hand out a code whose `percentOff` is out of
 * range, and `computeDiscountMinor` clamps whatever it is given. That keeps
 * `total = subtotal - discountMinor + shipping + tax` from ever going
 * negative, even if a bad row reaches this code some other way. When the
 * admin action is written, it should validate 1..100 too — as a UX
 * affordance that surfaces the error early, not as the source of the
 * guarantee, which lives here.
 */

/** One code has one identity: `launch20`, `Launch20` and ` LAUNCH20 ` are the same row. */
export function normaliseCode(raw: string): string {
  return raw.trim().toUpperCase()
}

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

/** A code that can be used right now, or null. See the module note on why null is undifferentiated. */
export async function resolveUsableCode(
  raw: string,
): Promise<{ id: string; code: string; percentOff: number } | null> {
  const code = normaliseCode(raw)
  if (!code) return null

  const row = await db.discountCode.findUnique({ where: { code } })
  if (!row) return null
  if (!row.active) return null
  if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) return null
  if (row.maxUses !== null && row.timesUsed >= row.maxUses) return null
  if (!Number.isInteger(row.percentOff) || row.percentOff < 1 || row.percentOff > 100) {
    console.error(`discount code ${row.id} has an out-of-range percentOff: ${row.percentOff}`)
    return null
  }

  return { id: row.id, code: row.code, percentOff: row.percentOff }
}
