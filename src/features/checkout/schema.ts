import { z } from 'zod'

export const contactSchema = z.object({
  email: z.email(),
})

/**
 * Upper bounds on address fields. The Prisma columns are unbounded TEXT and
 * `addAddress`/`editAddress` (`src/features/account/actions.ts`) are public
 * authenticated Server Actions, so without a cap here a signed-in caller
 * could POST arbitrarily large rows straight into Postgres. Limits are sized
 * generously above any real value (longest real-world address lines, names,
 * and phone numbers all fit comfortably under 200 chars) rather than tightly
 * — this is an abuse cap, not a UX validation rule, and the same schema also
 * gates checkout, which must never reject a genuine address.
 */
const NAME_MAX = 100
const PHONE_MAX = 20
const LINE_MAX = 200
const REGION_MAX = 100
const POSTAL_MAX = 20

export const addressSchema = z.object({
  fullName: z.string().min(1, 'Required').max(NAME_MAX, `${NAME_MAX} characters or fewer`),
  phone: z.string().min(1, 'Required').max(PHONE_MAX, `${PHONE_MAX} characters or fewer`),
  line1: z.string().min(1, 'Required').max(LINE_MAX, `${LINE_MAX} characters or fewer`),
  line2: z.string().max(LINE_MAX, `${LINE_MAX} characters or fewer`).optional(),
  city: z.string().min(1, 'Required').max(REGION_MAX, `${REGION_MAX} characters or fewer`),
  state: z.string().min(1, 'Required').max(REGION_MAX, `${REGION_MAX} characters or fewer`),
  country: z.string().min(1, 'Required').max(REGION_MAX, `${REGION_MAX} characters or fewer`),
  postalCode: z.string().max(POSTAL_MAX, `${POSTAL_MAX} characters or fewer`).optional(),
})

export type Contact = z.infer<typeof contactSchema>
export type Address = z.infer<typeof addressSchema>
