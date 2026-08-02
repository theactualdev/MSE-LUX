import 'server-only'

import { db } from '@/lib/db'
import { computeDiscountMinor, normaliseCode } from '@/features/discounts/discount-math'

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
 * Neither the Prisma schema (`percentOff Int`, no CHECK constraint) nor
 * Postgres itself enforces the 1..100 bound on `percentOff`. The admin
 * action (`@/features/admin/discounts/actions.ts`) validates 1..100 at
 * write time, but that is a UX affordance, not the guarantee — a bad row
 * could still reach this table some other way (a direct DB edit, a future
 * bulk-import path). So this module enforces the bound itself, in both
 * directions: `resolveUsableCode` refuses to hand out a code whose
 * `percentOff` is out of range, and `computeDiscountMinor` clamps whatever
 * it is given. That keeps `total = subtotal - discountMinor + shipping +
 * tax` from ever going negative, regardless of what the admin layer let
 * through.
 *
 * `computeDiscountMinor` itself now lives in the directive-free
 * `discount-math.ts` sibling and is only re-exported here for this module's
 * existing importers (`checkout/data.ts`, this file's own test) — the
 * checkout UI's live preview needs the SAME function but cannot import this
 * module (it carries `server-only`), so the pure arithmetic moved out to
 * where both a server module and a client component can reach it. See that
 * module's doc comment for the full rationale.
 *
 * `normaliseCode` lives there too, for the same reason and re-exported here
 * the same way — the admin write path (`@/features/admin/discounts/actions.ts`)
 * imports it directly from `discount-math.ts` rather than keeping its own
 * copy, so a code's normalised identity has exactly one implementation.
 */
export { computeDiscountMinor, normaliseCode }

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
