import { z } from 'zod'

export const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(8, 'At least 8 characters'),
})

export const signupSchema = z
  .object({
    name: z.string().min(1, 'Required'),
    email: z.email(),
    password: z.string().min(8, 'At least 8 characters'),
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

export const forgotSchema = z.object({ email: z.email() })

export const resetSchema = z
  .object({ password: z.string().min(8, 'At least 8 characters'), confirmPassword: z.string() })
  .refine((v) => v.password === v.confirmPassword, { message: 'Passwords do not match', path: ['confirmPassword'] })

export const profileSchema = z.object({
  name: z.string().min(1, 'Required'),
  email: z.email(),
  phone: z.string().optional(),
})

export type LoginValues = z.infer<typeof loginSchema>
export type SignupValues = z.infer<typeof signupSchema>
export type ForgotValues = z.infer<typeof forgotSchema>
export type ResetValues = z.infer<typeof resetSchema>
export type ProfileValues = z.infer<typeof profileSchema>
