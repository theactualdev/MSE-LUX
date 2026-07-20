'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { loginSchema, type LoginValues } from '@/features/account/schema'
import { signIn } from '@/features/auth/actions'
import { GoogleAuthButton } from '@/features/account/components/google-auth-button'

const DEFAULT_VALUES: LoginValues = { email: '', password: '' }
const GENERIC_ERROR = 'Something went wrong. Please try again.'

/**
 * Sign-in form. Validates with `loginSchema`; the password is never read
 * past validation. The email form stays the primary path — `GoogleAuthButton`
 * below is deliberately styled `outline` (secondary emphasis) and shares
 * this component's own `formError`/`role="alert"` region rather than owning
 * a second one, so a Google failure and an email-form failure are never
 * shown in two places at once.
 */
export function LoginForm() {
  const router = useRouter()
  const [formError, setFormError] = useState<string>()

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: DEFAULT_VALUES,
  })

  return (
    <div className="flex flex-col gap-6">
      <form
        className="flex flex-col gap-4"
        noValidate
        onSubmit={handleSubmit(async (values) => {
          setFormError(undefined)
          // signIn() never throws by design (it returns a typed { error? }
          // result) — this try/catch is only for a genuine transport failure
          // (network drop, server exception) that rejects the promise
          // instead, which otherwise produced an unhandled rejection with no
          // visible feedback: the button just re-enabled with no explanation.
          let result
          try {
            result = await signIn(values)
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
          <Label htmlFor="login-email">Email</Label>
          <Input
            id="login-email"
            type="email"
            autoComplete="email"
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? 'login-email-error' : undefined}
            {...register('email')}
          />
          {errors.email ? (
            <p id="login-email-error" className="text-sm text-destructive">
              {errors.email.message}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="login-password">Password</Label>
          <Input
            id="login-password"
            type="password"
            autoComplete="current-password"
            aria-invalid={!!errors.password}
            aria-describedby={errors.password ? 'login-password-error' : undefined}
            {...register('password')}
          />
          {errors.password ? (
            <p id="login-password-error" className="text-sm text-destructive">
              {errors.password.message}
            </p>
          ) : null}
        </div>

        {formError ? (
          <p role="alert" className="text-sm text-destructive">
            {formError}
          </p>
        ) : null}

        <Button type="submit" disabled={isSubmitting} className="mt-2 h-12 w-full">
          Sign in
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
