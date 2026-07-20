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
   * The editable fields, read server-side by the page. Not optional and not
   * fetched here: the route guard has already established there is a session,
   * so the page can resolve this before rendering and the form never has a
   * "loading" state to flash.
   */
  defaultValues: ProfileValues
  /**
   * The signed-in user's verified Supabase Auth email, displayed read-only.
   * Not part of `defaultValues`/`ProfileValues`: it isn't editable here (see
   * `data.ts`'s `updateProfile`), so it isn't form state RHF/Zod need to
   * manage or submit.
   */
  email: string
}

/**
 * Editable profile form (name, phone) for the signed-in account, plus a
 * read-only display of the sign-in email. Defaults come from the user's real
 * `Profile` row; a valid submit calls the `saveProfile` Server Action — which
 * re-validates and scopes the write to the session user — and shows a
 * transient "Saved" confirmation.
 *
 * Email is intentionally not editable here: `Profile.email` is `@unique`, and
 * `auth.users`' provisioning trigger inserts new profiles with an untargeted
 * `ON CONFLICT DO NOTHING` that would absorb a conflict on that unique email
 * as silently as one on `id` — so an editable email here could point another
 * user's future signup at a `Profile`-less account. See `data.ts`'s
 * `updateProfile` for the full account.
 */
export function ProfileForm({ defaultValues, email }: ProfileFormProps) {
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
          // internal control-flow errors. `unstable_rethrow` is wrapped in
          // its own try/catch — the repo-wide convention (see
          // `reset-password-form.tsx`, which documents it in full) — so a
          // real control-flow error is swallowed here rather than left to
          // become an unhandled rejection out of this RHF submit handler;
          // Next's own action-handling applies the redirect/notFound
          // regardless of how this promise settles.
          try {
            unstable_rethrow(error)
          } catch {
            return
          }
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
          value={email}
          readOnly
          disabled
          aria-describedby="profile-email-hint"
        />
        <p id="profile-email-hint" className="text-sm text-muted-foreground">
          This is the email you sign in with and can&apos;t be changed here. Contact support to
          update it.
        </p>
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
