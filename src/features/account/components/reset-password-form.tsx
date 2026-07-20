'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { unstable_rethrow } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { resetSchema, type ResetValues } from '@/features/account/schema'
import { updatePassword } from '@/features/auth/actions'

const DEFAULT_VALUES: ResetValues = { password: '', confirmPassword: '' }
const GENERIC_ERROR = 'Something went wrong. Please try again.'

/**
 * Reset-password form. Reached after Supabase's recovery link has already
 * established a session (via the callback route Task 7 adds), so this calls
 * `updatePassword` on that session rather than reading a token itself. Only
 * the new password is sent to the server — `confirmPassword` is a
 * client-only RHF check already enforced by `resetSchema`'s refine. No
 * password is ever logged or persisted client-side.
 *
 * No local "success" state/panel: a successful `updatePassword()` signs the
 * session out and calls `redirect('/login')` server-side, so this component
 * is always navigated away on success rather than re-rendering — see the
 * `catch` below for why that surfaces as a rejected promise, not a resolved
 * one, and why it has to be handled there instead of with a `result.error`
 * check.
 */
export function ResetPasswordForm() {
  const [formError, setFormError] = useState<string>()

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetValues>({
    resolver: zodResolver(resetSchema),
    defaultValues: DEFAULT_VALUES,
  })

  return (
    <form
      className="flex flex-col gap-4"
      noValidate
      onSubmit={handleSubmit(async (values) => {
        setFormError(undefined)
        try {
          const result = await updatePassword(values.password)
          if (result.error) {
            setFormError(result.error)
          }
        } catch (error) {
          // A successful updatePassword() redirects server-side, and
          // `redirect()` called from a server action invoked by a client
          // event handler surfaces here as a *rejected* promise carrying
          // Next's internal NEXT_REDIRECT digest, never a resolved value.
          // `sign-out.ts` documents the identical shape for `signOut()`
          // and establishes (empirically, against the real dev server) that
          // Next applies the redirect via its own action-handling
          // independently of whether/how this promise settles — nothing
          // here needs to (or should) perform the navigation itself.
          // `unstable_rethrow` is used purely as a version-resilient
          // classifier: it rethrows only for Next's own internal
          // control-flow errors (redirect/notFound/etc.), which is caught
          // right here and swallowed, matching `sign-out.ts`'s
          // `.catch()`. Anything unstable_rethrow does *not* rethrow is a
          // genuine failure (network drop, server exception) and gets the
          // same generic message as a Supabase-reported error.
          try {
            unstable_rethrow(error)
          } catch {
            return
          }
          setFormError(GENERIC_ERROR)
        }
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
