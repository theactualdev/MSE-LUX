'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { resetSchema, type ResetValues } from '@/features/account/schema'
import { updatePassword } from '@/features/auth/actions'

const DEFAULT_VALUES: ResetValues = { password: '', confirmPassword: '' }

/**
 * Reset-password form. Reached after Supabase's recovery link has already
 * established a session (via the callback route Task 7 adds), so this calls
 * `updatePassword` on that session rather than reading a token itself. Only
 * the new password is sent to the server — `confirmPassword` is a
 * client-only RHF check already enforced by `resetSchema`'s refine. No
 * password is ever logged or persisted client-side.
 */
export function ResetPasswordForm() {
  const [done, setDone] = useState(false)
  const [formError, setFormError] = useState<string>()

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetValues>({
    resolver: zodResolver(resetSchema),
    defaultValues: DEFAULT_VALUES,
  })

  if (done) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-foreground">Password updated.</p>
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
        const result = await updatePassword(values.password)
        if (result?.error) {
          setFormError(result.error)
          return
        }
        setDone(true)
      })}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="reset-password">New password</Label>
        <Input
          id="reset-password"
          type="password"
          autoComplete="new-password"
          aria-invalid={!!errors.password}
          aria-describedby={errors.password ? 'reset-password-error' : undefined}
          {...register('password')}
        />
        {errors.password ? (
          <p id="reset-password-error" className="text-sm text-destructive">
            {errors.password.message}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="reset-confirm-password">Confirm new password</Label>
        <Input
          id="reset-confirm-password"
          type="password"
          autoComplete="new-password"
          aria-invalid={!!errors.confirmPassword}
          aria-describedby={errors.confirmPassword ? 'reset-confirm-password-error' : undefined}
          {...register('confirmPassword')}
        />
        {errors.confirmPassword ? (
          <p id="reset-confirm-password-error" className="text-sm text-destructive">
            {errors.confirmPassword.message}
          </p>
        ) : null}
      </div>

      {formError ? (
        <p role="alert" className="text-sm text-destructive">
          {formError}
        </p>
      ) : null}

      <Button type="submit" disabled={isSubmitting} className="mt-2 h-12 w-full">
        Reset password
      </Button>
    </form>
  )
}
