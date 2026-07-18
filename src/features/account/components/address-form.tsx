'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { addressSchema, type Address } from '@/features/checkout/schema'

interface AddressFormProps {
  defaultValues?: Partial<Address>
  submitLabel: string
  onSubmit: (values: Address) => void
}

const DEFAULT_VALUES: Address = {
  fullName: '',
  phone: '',
  line1: '',
  line2: '',
  city: '',
  state: '',
  country: 'Nigeria',
  postalCode: '',
}

/**
 * Add/edit form for a saved address. Same field layout, validation, and
 * error wiring as checkout's `AddressStep`, but reports the validated values
 * to the caller (which decides whether to add or update) instead of driving
 * checkout navigation itself.
 */
export function AddressForm({ defaultValues, submitLabel, onSubmit }: AddressFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Address>({
    resolver: zodResolver(addressSchema),
    defaultValues: { ...DEFAULT_VALUES, ...defaultValues },
  })

  return (
    <form
      className="flex flex-col gap-4"
      noValidate
      onSubmit={handleSubmit((values) => onSubmit(values))}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="addr-form-full-name">Full name</Label>
        <Input
          id="addr-form-full-name"
          autoComplete="name"
          aria-invalid={!!errors.fullName}
          aria-describedby={errors.fullName ? 'addr-form-full-name-error' : undefined}
          {...register('fullName')}
        />
        {errors.fullName ? (
          <p id="addr-form-full-name-error" className="text-sm text-destructive">
            {errors.fullName.message}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="addr-form-phone">Phone number</Label>
        <Input
          id="addr-form-phone"
          type="tel"
          autoComplete="tel"
          aria-invalid={!!errors.phone}
          aria-describedby={errors.phone ? 'addr-form-phone-error' : undefined}
          {...register('phone')}
        />
        {errors.phone ? (
          <p id="addr-form-phone-error" className="text-sm text-destructive">
            {errors.phone.message}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="addr-form-line1">Address line 1</Label>
        <Input
          id="addr-form-line1"
          autoComplete="address-line1"
          aria-invalid={!!errors.line1}
          aria-describedby={errors.line1 ? 'addr-form-line1-error' : undefined}
          {...register('line1')}
        />
        {errors.line1 ? (
          <p id="addr-form-line1-error" className="text-sm text-destructive">
            {errors.line1.message}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="addr-form-line2">Address line 2 (optional)</Label>
        <Input id="addr-form-line2" autoComplete="address-line2" {...register('line2')} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="addr-form-city">City</Label>
          <Input
            id="addr-form-city"
            autoComplete="address-level2"
            aria-invalid={!!errors.city}
            aria-describedby={errors.city ? 'addr-form-city-error' : undefined}
            {...register('city')}
          />
          {errors.city ? (
            <p id="addr-form-city-error" className="text-sm text-destructive">
              {errors.city.message}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="addr-form-state">State</Label>
          <Input
            id="addr-form-state"
            autoComplete="address-level1"
            aria-invalid={!!errors.state}
            aria-describedby={errors.state ? 'addr-form-state-error' : undefined}
            {...register('state')}
          />
          {errors.state ? (
            <p id="addr-form-state-error" className="text-sm text-destructive">
              {errors.state.message}
            </p>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="addr-form-country">Country</Label>
          <Input
            id="addr-form-country"
            autoComplete="country-name"
            aria-invalid={!!errors.country}
            aria-describedby={errors.country ? 'addr-form-country-error' : undefined}
            {...register('country')}
          />
          {errors.country ? (
            <p id="addr-form-country-error" className="text-sm text-destructive">
              {errors.country.message}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="addr-form-postal-code">Postal code (optional)</Label>
          <Input id="addr-form-postal-code" autoComplete="postal-code" {...register('postalCode')} />
        </div>
      </div>

      <Button type="submit" className="mt-2 w-full">
        {submitLabel}
      </Button>
    </form>
  )
}
