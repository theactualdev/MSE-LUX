'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { contactMessageSchema, type ContactMessage } from '@/features/content/schema'

const DEFAULT_VALUES: ContactMessage = { name: '', email: '', subject: '', message: '' }

/**
 * Mock enquiry form. Never transmits or persists submitted values — it only
 * flips local state to show a success panel. No fetch, no storage, no logging.
 */
export function ContactForm() {
  const [sent, setSent] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ContactMessage>({
    resolver: zodResolver(contactMessageSchema),
    defaultValues: DEFAULT_VALUES,
  })

  if (sent) {
    return (
      <div role="status" className="flex flex-col gap-2 rounded-lg border border-border bg-muted/40 p-6">
        <p className="font-medium text-foreground">Thanks — we&apos;ll reply within 2 business days</p>
        <p className="text-sm text-muted-foreground">Demo form — messages aren&apos;t delivered yet.</p>
      </div>
    )
  }

  return (
    <form
      className="flex flex-col gap-4"
      noValidate
      onSubmit={handleSubmit(() => {
        setSent(true)
      })}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="contact-name">Name</Label>
        <Input
          id="contact-name"
          autoComplete="name"
          aria-invalid={!!errors.name}
          aria-describedby={errors.name ? 'contact-name-error' : undefined}
          {...register('name')}
        />
        {errors.name ? (
          <p id="contact-name-error" className="text-sm text-destructive">
            {errors.name.message}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="contact-email">Email</Label>
        <Input
          id="contact-email"
          type="email"
          autoComplete="email"
          aria-invalid={!!errors.email}
          aria-describedby={errors.email ? 'contact-email-error' : undefined}
          {...register('email')}
        />
        {errors.email ? (
          <p id="contact-email-error" className="text-sm text-destructive">
            {errors.email.message}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="contact-subject">Subject</Label>
        <Input
          id="contact-subject"
          aria-invalid={!!errors.subject}
          aria-describedby={errors.subject ? 'contact-subject-error' : undefined}
          {...register('subject')}
        />
        {errors.subject ? (
          <p id="contact-subject-error" className="text-sm text-destructive">
            {errors.subject.message}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="contact-message">Message</Label>
        <Textarea
          id="contact-message"
          rows={5}
          aria-invalid={!!errors.message}
          aria-describedby={errors.message ? 'contact-message-error' : undefined}
          {...register('message')}
        />
        {errors.message ? (
          <p id="contact-message-error" className="text-sm text-destructive">
            {errors.message.message}
          </p>
        ) : null}
      </div>

      <Button type="submit" className="mt-2 h-12 w-full">
        Send message
      </Button>

      <p className="text-sm text-muted-foreground">Demo form — messages aren&apos;t delivered yet.</p>
    </form>
  )
}
