import 'server-only'

import { db } from '@/lib/db'

/**
 * Discount engine (Phase 10b). Directive-free so both the public
 * `validateDiscountCode` action and `placeOrder` can call it; `server-only`
 * because it holds `@/lib/db`.
 *
 * `resolveUsableCode` returns the SAME null for unknown, inactive, expired and
 * exhausted codes. The caller renders one generic message from that null — a
 * message distinguishing the cases would confirm which codes exist.
 */

/** One code has one identity: `launch20`, `Launch20` and ` LAUNCH20 ` are the same row. */
export function normaliseCode(raw: string): string {
  return raw.trim().toUpperCase()
}

/**
 * The discount in minor units. `Math.round` matches every other money
 * calculation in this codebase. `percentOff` is capped at 100 by both the
 * schema validation and the admin action, so the result can never exceed the
 * subtotal and a negative total is unreachable by construction.
 */
export function computeDiscountMinor(subtotalMinor: number, percentOff: number): number {
  return Math.round((subtotalMinor * percentOff) / 100)
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

  return { id: row.id, code: row.code, percentOff: row.percentOff }
}
