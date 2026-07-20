'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { forgotSchema, type ForgotValues } from '@/features/account/schema'
import { requestPasswordReset } from '@/features/auth/actions'

const DEFAULT_VALUES: ForgotValues = { email: '' }
const GENERIC_ERROR = 'Something went wrong. Please try again.'

/**
 * Forgot-password form. Validates with `forgotSchema`, calls the
 * `requestPasswordReset` server action, and on success swaps to a "check
 * your inbox" confirmation panel — Supabase resolves this successfully
 * whether or not the address has an account, so the confirmation copy is
 * deliberately non-committal about existence either way.
 *
 * The confirmation panel shows once client-side validation passes,
 * regardless of whether the action resolves with `{}` or `{ error }` —
 * GoTrue's per-address rate-limit message only appears on a *repeat*
 * request, so surfacing it would let an attacker distinguish "this address
 * was requested before" from a fresh one, defeating the same enumeration
 * hygiene the confirmation copy is already there for. Only a genuine
 * rejection (network drop, server exception — the action never throws for
 * a Supabase-reported error, only for transport failures) keeps the user on
 * the form, via the `catch` below.
 */
export function ForgotPasswordForm() {
  const [submitted, setSubmitted] = useState(false)
  const [email, setEmail] = useState('')
  const [formError, setFormError] = useState<string>()

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
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
      onSubmit={handleSubmit(async (values) => {
        setFormError(undefined)
        try {
          await requestPasswordReset(values.email)
        } catch {
          setFormError(GENERIC_ERROR)
          return
        }
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

      {formError ? (
        <p role="alert" className="text-sm text-destructive">
          {formError}
        </p>
      ) : null}

      <Button type="submit" disabled={isSubmitting} className="mt-2 h-12 w-full">
        Send reset link
      </Button>
    </form>
  )
}
