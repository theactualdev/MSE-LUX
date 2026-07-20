'use client'

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { unstable_rethrow } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { profileSchema, type ProfileValues } from '@/features/account/schema'
import { saveProfile } from '@/features/account/actions'

const SAVED_MESSAGE_MS = 3000
const GENERIC_ERROR = 'Something went wrong. Please try again.'

interface ProfileFormProps {
  /**
   * The stored profile, read server-side by the page. Not optional and not
   * fetched here: the route guard has already established there is a session,
   * so the page can resolve this before rendering and the form never has a
   * "loading" state to flash.
   */
  defaultValues: ProfileValues
}

/**
 * Editable profile form (name, email, phone) for the signed-in account.
 * Defaults come from the user's real `Profile` row; a valid submit calls the
 * `saveProfile` Server Action — which re-validates and scopes the write to
 * the session user — and shows a transient "Saved" confirmation.
 *
 * NOTE: editing the email here updates the `Profile` record, not the Supabase
 * Auth email used to sign in. Changing that requires a confirmation
 * round-trip and is out of scope for this phase; see `data.ts`'s
 * `updateProfile`.
 */
export function ProfileForm({ defaultValues }: ProfileFormProps) {
  const [saved, setSaved] = useState(false)
  const [formError, setFormError] = useState<string | undefined>(undefined)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues,
  })

  useEffect(() => {
    if (!saved) return
    const id = setTimeout(() => setSaved(false), SAVED_MESSAGE_MS)
    return () => clearTimeout(id)
  }, [saved])

  return (
    <form
      className="flex flex-col gap-4"
      noValidate
      onSubmit={handleSubmit(async (values) => {
        setFormError(undefined)
        setSaved(false)

        let result
        try {
          result = await saveProfile(values)
        } catch (error) {
          // `saveProfile` returns a typed `{ error? }` rather than throwing,
          // so this is only reached for a transport failure — or for Next's
          // internal control-flow errors, which `unstable_rethrow` re-throws
          // so they reach the router instead of being rendered as a
          // user-facing message.
          unstable_rethrow(error)
          setFormError(GENERIC_ERROR)
          return
        }

        if (result.error) {
          setFormError(result.error)
          return
        }

        setSaved(true)
      })}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="profile-name">Name</Label>
        <Input
          id="profile-name"
          autoComplete="name"
          aria-invalid={!!errors.name}
          aria-describedby={errors.name ? 'profile-name-error' : undefined}
          {...register('name')}
        />
        {errors.name ? (
          <p id="profile-name-error" className="text-sm text-destructive">
            {errors.name.message}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="profile-email">Email</Label>
        <Input
          id="profile-email"
          type="email"
          autoComplete="email"
          aria-invalid={!!errors.email}
          aria-describedby={errors.email ? 'profile-email-error' : undefined}
          {...register('email')}
        />
        {errors.email ? (
          <p id="profile-email-error" className="text-sm text-destructive">
            {errors.email.message}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="profile-phone">Phone (optional)</Label>
        <Input
          id="profile-phone"
          type="tel"
          autoComplete="tel"
          aria-invalid={!!errors.phone}
          aria-describedby={errors.phone ? 'profile-phone-error' : undefined}
          {...register('phone')}
        />
        {errors.phone ? (
          <p id="profile-phone-error" className="text-sm text-destructive">
            {errors.phone.message}
          </p>
        ) : null}
      </div>

      {formError ? (
        <p role="alert" className="text-sm text-destructive">
          {formError}
        </p>
      ) : null}

      <Button type="submit" disabled={isSubmitting} className="mt-2 h-12 w-full sm:w-auto">
        Save changes
      </Button>
      {saved ? (
        <p role="status" className="text-sm text-muted-foreground">
          Saved.
        </p>
      ) : null}
    </form>
  )
}
