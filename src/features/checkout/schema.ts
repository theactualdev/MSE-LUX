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
// 20 was too tight: a formatted international number with an extension can
// exceed it (`"+44 (0) 20 7946 0958"` is exactly 20 characters, and any
// extension pushes past it). 32 comfortably covers real-world formatted
// numbers with extensions while staying well under the abuse-cap intent
// above.
const PHONE_MAX = 32
const LINE_MAX = 200
const REGION_MAX = 100
const POSTAL_MAX = 20

export const addressSchema = z.object({
  // A deliberate exception to the "abuse cap, not UX validation" rule above,
  // forced by the courier: ShipBubble's address validation REJECTS a
  // single-word name ("Please provide a full name (e.g John Doe), please
  // remove all numbers and symbols" — verified against the production API).
  // Letting one through doesn't fail checkout, it silently degrades every
  // quote to the flat fallback — which internationally UNDERCHARGES the store
  // by tens of thousands of naira — with nothing telling the customer why.
  // Rejecting here, with a message, is strictly better than mispricing there.
  //
  // Only the two rules the courier actually enforces: two words, no digits.
  // Hyphens, apostrophes and diacritics stay legal — "Mary-Jane O'Brien" is a
  // genuine name, and over-restricting names is how checkouts reject real
  // customers.
  fullName: z
    .string()
    .trim()
    .min(1, 'Required')
    .max(NAME_MAX, `${NAME_MAX} characters or fewer`)
    .refine((value) => !/\d/.test(value), 'Name can’t contain numbers')
    .refine(
      (value) => value.split(/\s+/).filter((word) => /\p{L}/u.test(word)).length >= 2,
      'Enter first and last name — the courier needs a full name for delivery',
    ),
  // The UI now emits E.164 (`+2348012345678`) via `PhoneField`, but this
  // schema stays FORMAT-AGNOSTIC on purpose: it also validates addresses saved
  // before that control existed, which hold local-format numbers like
  // `08012345678`. Requiring E.164 here would make a customer's own stored
  // address un-editable — a validation rule breaking data the app itself
  // wrote.
  //
  // The digit floor is the part that matters: `PhoneField` returns '' rather
  // than a bare dial code, but a half-typed "+2341" would otherwise satisfy
  // `min(1)` and reach ShipBubble as an unusable number. Seven digits clears
  // every national number in real use while rejecting a stray keystroke.
  phone: z
    .string()
    .min(1, 'Required')
    .max(PHONE_MAX, `${PHONE_MAX} characters or fewer`)
    .refine((value) => value.replace(/\D/g, '').length >= 7, 'Enter a valid phone number'),
  line1: z.string().min(1, 'Required').max(LINE_MAX, `${LINE_MAX} characters or fewer`),
  line2: z.string().max(LINE_MAX, `${LINE_MAX} characters or fewer`).optional(),
  city: z.string().min(1, 'Required').max(REGION_MAX, `${REGION_MAX} characters or fewer`),
  state: z.string().min(1, 'Required').max(REGION_MAX, `${REGION_MAX} characters or fewer`),
  country: z.string().min(1, 'Required').max(REGION_MAX, `${REGION_MAX} characters or fewer`),
  postalCode: z.string().max(POSTAL_MAX, `${POSTAL_MAX} characters or fewer`).optional(),
})

export type Contact = z.infer<typeof contactSchema>
export type Address = z.infer<typeof addressSchema>
