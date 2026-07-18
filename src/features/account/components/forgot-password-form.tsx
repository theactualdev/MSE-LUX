'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { forgotSchema, type ForgotValues } from '@/features/account/schema'

const DEFAULT_VALUES: ForgotValues = { email: '' }

/**
 * Forgot-password form. Validates with `forgotSchema` and, on success,
 * swaps to a confirmation panel — mock only, no email is ever sent.
 */
export function ForgotPasswordForm() {
  const [submitted, setSubmitted] = useState(false)
  const [email, setEmail] = useState('')

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotValues>({
    resolver: zodResolver(forgotSchema),
    defaultValues: DEFAULT_VALUES,
  })

  if (submitted) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-foreground">
          Check your inbox — if an account exists for <span className="font-medium">{email}</span>, a reset link is
          on its way.
        </p>
        <p className="text-sm">
          <Link href="/login" className="text-accent hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    )
  }

  return (
    <form
      className="flex flex-col gap-4"
      noValidate
      onSubmit={handleSubmit((values) => {
        setEmail(values.email)
        setSubmitted(true)
      })}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="forgot-email">Email</Label>
        <Input
          id="forgot-email"
          type="email"
          autoComplete="email"
          aria-invalid={!!errors.email}
          aria-describedby={errors.email ? 'forgot-email-error' : undefined}
          {...register('email')}
        />
        {errors.email ? (
          <p id="forgot-email-error" className="text-sm text-destructive">
            {errors.email.message}
          </p>
        ) : null}
      </div>

      <Button type="submit" className="mt-2 h-12 w-full">
        Send reset link
      </Button>
    </form>
  )
}
