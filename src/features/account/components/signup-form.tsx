'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { signupSchema, type SignupValues } from '@/features/account/schema'
import { signUp } from '@/features/auth/actions'
import { GoogleAuthButton } from '@/features/account/components/google-auth-button'

const DEFAULT_VALUES: SignupValues = { name: '', email: '', password: '', confirmPassword: '' }
const GENERIC_ERROR = 'Something went wrong. Please try again.'

/**
 * Sign-up form. Validates with `signupSchema`; passwords are never read past
 * validation. The email form stays the primary path — `GoogleAuthButton`
 * below is deliberately styled `outline` (secondary emphasis) and shares
 * this component's own `formError`/`role="alert"` region rather than owning
 * a second one, so a Google failure and an email-form failure are never
 * shown in two places at once.
 */
export function SignupForm() {
  const router = useRouter()
  const [formError, setFormError] = useState<string>()

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignupValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: DEFAULT_VALUES,
  })

  return (
    <div className="flex flex-col gap-6">
      <form
        className="flex flex-col gap-4"
        noValidate
        onSubmit={handleSubmit(async (values) => {
          setFormError(undefined)
          // signUp() never throws by design (it returns a typed { error? }
          // result) — this try/catch is only for a genuine transport failure
          // (network drop, server exception) that rejects the promise
          // instead, which otherwise produced an unhandled rejection with no
          // visible feedback: the button just re-enabled with no explanation.
          let result
          try {
            // Only the fields signUp needs — confirmPassword was already
            // enforced client-side by zodResolver and has no reason to be
            // sent to the server a second time.
            result = await signUp({ name: values.name, email: values.email, password: values.password })
          } catch {
            setFormError(GENERIC_ERROR)
            return
          }
          if (result.error) {
            setFormError(result.error)
            return
          }
          router.push('/account')
        })}
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="signup-name">Full name</Label>
          <Input
            id="signup-name"
            autoComplete="name"
            aria-invalid={!!errors.name}
            aria-describedby={errors.name ? 'signup-name-error' : undefined}
            {...register('name')}
          />
          {errors.name ? (
            <p id="signup-name-error" className="text-sm text-destructive">
              {errors.name.message}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="signup-email">Email</Label>
          <Input
            id="signup-email"
            type="email"
            autoComplete="email"
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? 'signup-email-error' : undefined}
            {...register('email')}
          />
          {errors.email ? (
            <p id="signup-email-error" className="text-sm text-destructive">
              {errors.email.message}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="signup-password">Password</Label>
          <Input
            id="signup-password"
            type="password"
            autoComplete="new-password"
            aria-invalid={!!errors.password}
            aria-describedby={errors.password ? 'signup-password-error' : undefined}
            {...register('password')}
          />
          {errors.password ? (
            <p id="signup-password-error" className="text-sm text-destructive">
              {errors.password.message}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="signup-confirm-password">Confirm password</Label>
          <Input
            id="signup-confirm-password"
            type="password"
            autoComplete="new-password"
            aria-invalid={!!errors.confirmPassword}
            aria-describedby={errors.confirmPassword ? 'signup-confirm-password-error' : undefined}
            {...register('confirmPassword')}
          />
          {errors.confirmPassword ? (
            <p id="signup-confirm-password-error" className="text-sm text-destructive">
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
          Create account
        </Button>
      </form>

      <div className="flex items-center gap-3">
        <Separator className="flex-1" />
        <span className="text-xs text-muted-foreground">or</span>
        <Separator className="flex-1" />
      </div>

      <GoogleAuthButton onError={setFormError} />
    </div>
  )
}
