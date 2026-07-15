'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { addressSchema, type Address } from '@/features/checkout/schema'

interface AddressStepProps {
  defaultValues?: Partial<Address>
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

/** Shipping address form. Validates with `addressSchema` before calling `onSubmit`. */
export function AddressStep({ defaultValues, onSubmit }: AddressStepProps) {
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
        <Label htmlFor="address-full-name">Full name</Label>
        <Input
          id="address-full-name"
          autoComplete="name"
          aria-invalid={!!errors.fullName}
          aria-describedby={errors.fullName ? 'address-full-name-error' : undefined}
          {...register('fullName')}
        />
        {errors.fullName ? (
          <p id="address-full-name-error" className="text-sm text-destructive">
            {errors.fullName.message}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="address-phone">Phone number</Label>
        <Input
          id="address-phone"
          type="tel"
          autoComplete="tel"
          aria-invalid={!!errors.phone}
          aria-describedby={errors.phone ? 'address-phone-error' : undefined}
          {...register('phone')}
        />
        {errors.phone ? (
          <p id="address-phone-error" className="text-sm text-destructive">
            {errors.phone.message}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="address-line1">Address line 1</Label>
        <Input
          id="address-line1"
          autoComplete="address-line1"
          aria-invalid={!!errors.line1}
          aria-describedby={errors.line1 ? 'address-line1-error' : undefined}
          {...register('line1')}
        />
        {errors.line1 ? (
          <p id="address-line1-error" className="text-sm text-destructive">
            {errors.line1.message}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="address-line2">Address line 2 (optional)</Label>
        <Input id="address-line2" autoComplete="address-line2" {...register('line2')} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="address-city">City</Label>
          <Input
            id="address-city"
            autoComplete="address-level2"
            aria-invalid={!!errors.city}
            aria-describedby={errors.city ? 'address-city-error' : undefined}
            {...register('city')}
          />
          {errors.city ? (
            <p id="address-city-error" className="text-sm text-destructive">
              {errors.city.message}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="address-state">State</Label>
          <Input
            id="address-state"
            autoComplete="address-level1"
            aria-invalid={!!errors.state}
            aria-describedby={errors.state ? 'address-state-error' : undefined}
            {...register('state')}
          />
          {errors.state ? (
            <p id="address-state-error" className="text-sm text-destructive">
              {errors.state.message}
            </p>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="address-country">Country</Label>
          <Input
            id="address-country"
            autoComplete="country-name"
            aria-invalid={!!errors.country}
            aria-describedby={errors.country ? 'address-country-error' : undefined}
            {...register('country')}
          />
          {errors.country ? (
            <p id="address-country-error" className="text-sm text-destructive">
              {errors.country.message}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="address-postal-code">Postal code (optional)</Label>
          <Input id="address-postal-code" autoComplete="postal-code" {...register('postalCode')} />
        </div>
      </div>

      <Button type="submit" className="mt-2 w-full">
        Continue
      </Button>
    </form>
  )
}
