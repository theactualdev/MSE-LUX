import { z } from 'zod'

export const contactMessageSchema = z.object({
  name: z.string().min(1, 'Required'),
  email: z.email(),
  subject: z.string().min(1, 'Required'),
  message: z.string().min(10, 'Please give us a little more detail'),
})

export type ContactMessage = z.infer<typeof contactMessageSchema>
