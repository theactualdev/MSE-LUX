'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { signupSchema, type SignupValues } from '@/features/account/schema'
import { signUp } from '@/features/auth/actions'

const DEFAULT_VALUES: SignupValues = { name: '', email: '', password: '', confirmPassword: '' }

/** Sign-up form. Validates with `signupSchema`; passwords are never read past validation. */
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
    <form
      className="flex flex-col gap-4"
      noValidate
      onSubmit={handleSubmit(async (values) => {
        setFormError(undefined)
        // Only the fields signUp needs — confirmPassword was already
        // enforced client-side by zodResolver and has no reason to be sent
        // to the server a second time.
        const result = await signUp({ name: values.name, email: values.email, password: values.password })
        if (result?.error) {
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
  )
}
