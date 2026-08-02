import 'server-only'

import { db } from '@/lib/db'
import { computeDiscountMinor } from '@/features/discounts/discount-math'

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
 *
 * `computeDiscountMinor` itself now lives in the directive-free
 * `discount-math.ts` sibling and is only re-exported here for this module's
 * existing importers (`checkout/data.ts`, this file's own test) — the
 * checkout UI's live preview needs the SAME function but cannot import this
 * module (it carries `server-only`), so the pure arithmetic moved out to
 * where both a server module and a client component can reach it. See that
 * module's doc comment for the full rationale.
 */
export { computeDiscountMinor }

/** One code has one identity: `launch20`, `Launch20` and ` LAUNCH20 ` are the same row. */
export function normaliseCode(raw: string): string {
  return raw.trim().toUpperCase()
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
