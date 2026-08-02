'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { Role } from '@/generated/prisma/client'
import { getCurrentRole, roleSatisfies } from '@/features/auth/claims'
import { db } from '@/lib/db'

/**
 * The admin-discounts Server Actions (Phase 10b, Task 7). SECURITY: actions
 * are public HTTP endpoints — the (admin) layout gate covers RENDERING only,
 * so every action here re-checks ADMIN itself before touching the database.
 * Same idiom as `admin/orders/actions.ts` and `admin/catalog/actions.ts`.
 *
 * Validation here is a UX affordance, not the guarantee: `percentOff`'s
 * 1..100 bound is enforced for real in `@/features/discounts/discount.ts`
 * (`resolveUsableCode` refuses to hand out an out-of-range row;
 * `computeDiscountMinor` clamps regardless). This zod check just stops an
 * admin creating such a row in the first place — it does not replace the
 * engine-side guarantee.
 *
 * Archive, never delete: `setDiscountActiveAction` only ever flips `active`.
 * A hard delete would destroy the merchant's own record of a promotion's
 * performance; orders that used a code are safe either way, since they
 * snapshot the code string rather than holding a foreign key to this row.
 * Same reasoning as archive-first product deletion in Phase 8c.
 */

async function isAdmin(): Promise<boolean> {
  return roleSatisfies(await getCurrentRole(), Role.ADMIN)
}

export type DiscountActionResult = { ok: true } | { ok: false; error: string }

const FORBIDDEN: DiscountActionResult = { ok: false, error: 'forbidden' }
const GENERIC_ERROR = 'Something went wrong. Please try again.'
const DUPLICATE_CODE_ERROR = 'A discount code with this code already exists.'
const NOT_FOUND_ERROR = 'This discount code no longer exists.'
const INVALID_REQUEST_ERROR = 'Invalid request.'

/** Prisma's unique-constraint violation. Matched structurally so this module needn't import the error class — same idiom as `cart/data.ts`. */
function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002'
}

/** One code has one identity: `launch20`, `Launch20` and ` LAUNCH20 ` are the same row — same normalisation as the public engine's `normaliseCode` in `@/features/discounts/discount.ts`. */
function normaliseCode(raw: string): string {
  return raw.trim().toUpperCase()
}

const discountFieldsSchema = z.object({
  code: z.string().trim().min(1).max(64),
  percentOff: z.number().int().min(1).max(100),
  maxUses: z.number().int().positive().nullable(),
  expiresAt: z.date().nullable(),
})

const createDiscountSchema = discountFieldsSchema
const updateDiscountSchema = discountFieldsSchema.extend({ id: z.string().min(1) })

export async function createDiscountAction(input: unknown): Promise<DiscountActionResult> {
  if (!(await isAdmin())) return FORBIDDEN

  const parsed = createDiscountSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? GENERIC_ERROR }

  try {
    await db.discountCode.create({
      data: {
        code: normaliseCode(parsed.data.code),
        percentOff: parsed.data.percentOff,
        maxUses: parsed.data.maxUses,
        expiresAt: parsed.data.expiresAt,
      },
    })
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, error: DUPLICATE_CODE_ERROR }
    console.error('[createDiscountAction] unexpected error', error)
    return { ok: false, error: GENERIC_ERROR }
  }

  revalidatePath('/admin/discounts')
  return { ok: true }
}

export async function updateDiscountAction(input: unknown): Promise<DiscountActionResult> {
  if (!(await isAdmin())) return FORBIDDEN

  const parsed = updateDiscountSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? GENERIC_ERROR }

  const { id, maxUses } = parsed.data

  const current = await db.discountCode.findUnique({ where: { id }, select: { timesUsed: true } })
  if (!current) return { ok: false, error: NOT_FOUND_ERROR }

  // A cap set below usage-to-date would make an otherwise-live code
  // instantly unusable — almost always a typo, never a deliberate write a
  // silent update should allow through.
  if (maxUses !== null && maxUses < current.timesUsed) {
    return {
      ok: false,
      error: `This code has already been used ${current.timesUsed} time${current.timesUsed === 1 ? '' : 's'} — set max uses to ${current.timesUsed} or more.`,
    }
  }

  try {
    await db.discountCode.update({
      where: { id },
      data: {
        code: normaliseCode(parsed.data.code),
        percentOff: parsed.data.percentOff,
        maxUses,
        expiresAt: parsed.data.expiresAt,
      },
    })
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, error: DUPLICATE_CODE_ERROR }
    console.error('[updateDiscountAction] unexpected error', error)
    return { ok: false, error: GENERIC_ERROR }
  }

  revalidatePath('/admin/discounts')
  return { ok: true }
}

export async function setDiscountActiveAction(id: unknown, active: unknown): Promise<DiscountActionResult> {
  if (!(await isAdmin())) return FORBIDDEN

  const parsedId = z.string().min(1).safeParse(id)
  const parsedActive = z.boolean().safeParse(active)
  if (!parsedId.success || !parsedActive.success) return { ok: false, error: INVALID_REQUEST_ERROR }

  try {
    const result = await db.discountCode.updateMany({
      where: { id: parsedId.data },
      data: { active: parsedActive.data },
    })
    if (result.count === 0) return { ok: false, error: NOT_FOUND_ERROR }
  } catch (error) {
    console.error('[setDiscountActiveAction] unexpected error', error)
    return { ok: false, error: GENERIC_ERROR }
  }

  revalidatePath('/admin/discounts')
  return { ok: true }
}
