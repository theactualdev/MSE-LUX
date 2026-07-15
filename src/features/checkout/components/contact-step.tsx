'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { contactSchema, type Contact } from '@/features/checkout/schema'

interface ContactStepProps {
  defaultValues?: Partial<Contact>
  onSubmit: (values: Contact) => void
}

const DEFAULT_VALUES: Contact = {
  email: '',
}

/** Contact (email) form. Validates with `contactSchema` before calling `onSubmit`. */
export function ContactStep({ defaultValues, onSubmit }: ContactStepProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Contact>({
    resolver: zodResolver(contactSchema),
    defaultValues: { ...DEFAULT_VALUES, ...defaultValues },
  })

  return (
    <form
      className="flex flex-col gap-4"
      noValidate
      onSubmit={handleSubmit((values) => onSubmit(values))}
    >
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

      <Button type="submit" className="mt-2 w-full">
        Continue
      </Button>
    </form>
  )
}
