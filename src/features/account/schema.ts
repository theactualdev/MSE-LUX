import { z } from 'zod'

export const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(8, 'At least 8 characters'),
})

/**
 * Server-side counterpart to `loginSchema` for `signIn`'s re-validation.
 * Deliberately does NOT enforce `min(8)`: that's a password-*strength* rule
 * that belongs on the set-password path (signup/reset), not the
 * verify-password path. Supabase's own minimum is 6, so re-checking against
 * our stricter client-side UX rule here would reject valid 6-7 character
 * passwords on accounts created outside this form (dashboard, seed, invite)
 * with an error indistinguishable from wrong credentials. Presence is all
 * that's needed before handing off to Supabase, which is the actual
 * authority on whether the password is correct.
 */
export const loginServerSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
})

const signupFields = z.object({
  name: z.string().min(1, 'Required').max(100, '100 characters or fewer'),
  email: z.email(),
  password: z.string().min(8, 'At least 8 characters'),
  confirmPassword: z.string(),
})

export const signupSchema = signupFields.refine((v) => v.password === v.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
})

/**
 * Server-side counterpart to `signupSchema` for `signUp`'s re-validation.
 * `signupSchema` can't be reused directly here: `.refine()` returns a
 * `ZodEffects`, not a `ZodObject`, and `signUp` never receives
 * `confirmPassword` from the client (it's a client-only UX check), so
 * validating against `signupSchema` would require synthesizing a
 * `confirmPassword` value the server never actually saw — making the
 * refine's match check tautological. Omitting the field from the base
 * object instead means the server validates only what it actually receives.
 */
export const signupServerSchema = signupFields.omit({ confirmPassword: true })

export const forgotSchema = z.object({ email: z.email() })

export const resetSchema = z
  .object({ password: z.string().min(8, 'At least 8 characters'), confirmPassword: z.string() })
  .refine((v) => v.password === v.confirmPassword, { message: 'Passwords do not match', path: ['confirmPassword'] })

export const profileSchema = z.object({
  // Bounded the same as `signupFields.name`: both write the same
  // `Profile.name` column (Task 2's provisioning trigger for signup, this
  // schema for profile edits), so they should enforce the same limit rather
  // than letting a profile update write a value signup itself would reject.
  name: z.string().min(1, 'Required').max(100, '100 characters or fewer'),
  email: z.email(),
  phone: z.string().optional(),
})

export type LoginValues = z.infer<typeof loginSchema>
export type SignupValues = z.infer<typeof signupSchema>
export type ForgotValues = z.infer<typeof forgotSchema>
export type ResetValues = z.infer<typeof resetSchema>
export type ProfileValues = z.infer<typeof profileSchema>
