'use client'

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { profileSchema, type ProfileValues } from '@/features/account/schema'
import { useAuthStore } from '@/features/account/store'

const SAVED_MESSAGE_MS = 3000

/**
 * Editable profile form (name, email, phone) for the signed-in account.
 * Defaults come from the current `useAuthStore` user; a valid submit patches
 * the store and shows a transient "Saved" confirmation.
 */
export function ProfileForm() {
  const user = useAuthStore((s) => s.user)
  const updateProfile = useAuthStore((s) => s.updateProfile)
  const [saved, setSaved] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: user?.name ?? '',
      email: user?.email ?? '',
      phone: user?.phone ?? '',
    },
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
      onSubmit={handleSubmit((values) => {
        updateProfile(values)
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

      <Button type="submit" className="mt-2 h-12 w-full sm:w-auto">
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
