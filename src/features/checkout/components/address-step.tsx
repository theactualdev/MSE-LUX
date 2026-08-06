'use client'

import { useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PhoneField } from '@/components/ui/phone-field'
import { CountrySelect, RegionField } from '@/components/ui/country-region-fields'
import { addressSchema, type Address } from '@/features/checkout/schema'

interface AddressStepProps {
  defaultValues?: Partial<Address>
  /** Only a signed-in caller can save an address to their account — the checkbox renders only when this is true. */
  isSignedIn?: boolean
  /** `saveAddress` rides alongside the validated address rather than inside it: it isn't an `Address` field, so it isn't part of `addressSchema`/react-hook-form's managed state. */
  onSubmit: (values: Address, saveAddress: boolean) => void
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
export function AddressStep({ defaultValues, isSignedIn, onSubmit }: AddressStepProps) {
  const {
    register,
    control,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<Address>({
    resolver: zodResolver(addressSchema),
    defaultValues: { ...DEFAULT_VALUES, ...defaultValues },
  })

  // Unchecked by default — saving to the account is opt-in, never implied by
  // filling out the form.
  const [saveAddress, setSaveAddress] = useState(false)
  // `useWatch`, not `watch()`: the latter returns a fresh function each
  // render that the React Compiler cannot memoize safely.
  const selectedCountry = useWatch({ control, name: 'country' }) ?? ''

  return (
    <form
      className="flex flex-col gap-4"
      noValidate
      onSubmit={handleSubmit((values) => onSubmit(values, saveAddress))}
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
        {/* `Controller`, not `register`: the country selector and the national
            number are two controls composing one `phone` value, so the field
            is controlled rather than uncontrolled-by-ref. */}
        <Controller
          control={control}
          name="phone"
          render={({ field }) => (
            <PhoneField
              id="address-phone"
              value={field.value ?? ''}
              onChange={field.onChange}
              onBlur={field.onBlur}
              aria-invalid={!!errors.phone}
              aria-describedby={errors.phone ? 'address-phone-error' : undefined}
            />
          )}
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

        <Controller
          control={control}
          name="state"
          render={({ field }) => (
            <RegionField
              id="address-state"
              country={selectedCountry}
              value={field.value ?? ''}
              onChange={field.onChange}
              error={errors.state?.message}
            />
          )}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Controller
          control={control}
          name="country"
          render={({ field }) => (
            <CountrySelect
              id="address-country"
              value={field.value ?? ''}
              onChange={(next) => {
                field.onChange(next)
                // Clear the region: the previous one belongs to the previous
                // country, and carrying "Lagos" into Canada would send a
                // nonsense address line to the courier.
                setValue('state', '', { shouldValidate: false })
              }}
              error={errors.country?.message}
            />
          )}
        />

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="address-postal-code">Postal code (optional)</Label>
          <Input id="address-postal-code" autoComplete="postal-code" {...register('postalCode')} />
        </div>
      </div>

      {isSignedIn ? (
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            id="address-save-to-account"
            checked={saveAddress}
            onChange={(e) => setSaveAddress(e.target.checked)}
          />
          Save this address to my account
        </label>
      ) : null}

      <Button type="submit" className="mt-2 w-full">
        Continue
      </Button>
    </form>
  )
}
