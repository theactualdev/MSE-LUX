import { z } from 'zod'

export const contactSchema = z.object({
  email: z.email(),
})

export const addressSchema = z.object({
  fullName: z.string().min(1, 'Required'),
  phone: z.string().min(1, 'Required'),
  line1: z.string().min(1, 'Required'),
  line2: z.string().optional(),
  city: z.string().min(1, 'Required'),
  state: z.string().min(1, 'Required'),
  country: z.string().min(1, 'Required'),
  postalCode: z.string().optional(),
})

export type Contact = z.infer<typeof contactSchema>
export type Address = z.infer<typeof addressSchema>
