'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { addressSchema, type Address } from '@/features/checkout/schema'
import { profileSchema, type ProfileValues } from '@/features/account/schema'
import {
  createAddress,
  deleteAddress,
  setDefaultAddress,
  updateAddress,
  updateProfile,
  type MutationResult,
} from '@/features/account/data'

/**
 * Server Actions for the customer dashboard — the only way the client
 * components in `components/` reach `data.ts`.
 *
 * Why a separate file from `data.ts` rather than marking that module
 * `'use server'`: every export of a `'use server'` module is a public HTTP
 * endpoint. `data.ts` is also imported by Server Components for their reads
 * (`getProfile`, `listAddresses`), and publishing those as endpoints would
 * widen the attack surface for no benefit. Keeping the two apart means
 * `data.ts` stays `server-only` (importable, not callable from outside) and
 * exactly the five mutations below are exposed.
 *
 * Every action here re-validates with `safeParse` before touching the data
 * layer, per the convention Task 5 established: the client's `zodResolver`
 * runs only in the browser and the TypeScript parameter types are erased at
 * runtime, so anyone can POST arbitrary JSON straight at these. Failures
 * return fixed generic copy rather than a Prisma or Supabase message.
 */
export interface AccountActionResult {
  error?: string
}

const PROFILE_INVALID = 'Please check your details and try again.'
const ADDRESS_INVALID = 'Please check the address details and try again.'
const EMAIL_TAKEN = 'That email address is already in use.'
const GENERIC_ERROR = 'Something went wrong. Please try again.'

/**
 * Copy for a row that either never existed, was deleted concurrently, or
 * belongs to somebody else. All three deliberately collapse into one message:
 * the ids are cuids and therefore guessable-ish in bulk, so distinguishing
 * "not yours" from "not there" would turn these actions into an oracle for
 * whether an arbitrary address id exists.
 */
const ADDRESS_GONE = 'That address is no longer available.'

const addressIdSchema = z.string().min(1)

/** Maps the data layer's reason codes to caller-safe copy. Nothing else in this file returns a string. */
function addressErrorFor(result: MutationResult): AccountActionResult {
  if (result.ok) return {}
  return { error: result.reason === 'not-found' ? ADDRESS_GONE : GENERIC_ERROR }
}

/**
 * Saves the profile form. `revalidatePath('/account')` refreshes the
 * server-rendered profile page (and `AccountShell`'s header line, which
 * renders the same name/email) so the saved values are what the next render
 * reads back from the database — no optimistic client copy to drift.
 */
export async function saveProfile(values: ProfileValues): Promise<AccountActionResult> {
  const parsed = profileSchema.safeParse(values)
  if (!parsed.success) {
    return { error: PROFILE_INVALID }
  }

  const result = await updateProfile(parsed.data)

  if (!result.ok) {
    return { error: result.reason === 'email-taken' ? EMAIL_TAKEN : GENERIC_ERROR }
  }

  revalidatePath('/account')
  return {}
}

/**
 * Adds a saved address. `parsed.data` — not `values` — is what reaches the
 * data layer, so Zod's projection strips any extra keys a hand-rolled request
 * bolted on (`profileId`, `isDefault`, `id`) before they can be spread
 * anywhere near Prisma.
 */
export async function addAddress(values: Address): Promise<AccountActionResult> {
  const parsed = addressSchema.safeParse(values)
  if (!parsed.success) {
    return { error: ADDRESS_INVALID }
  }

  const result = await createAddress(parsed.data)
  if (!result.ok) return addressErrorFor(result)

  revalidatePath('/account/addresses')
  return {}
}

/** Edits a saved address. The id is validated too — it arrives over the wire like everything else. */
export async function editAddress(id: string, values: Address): Promise<AccountActionResult> {
  const parsedId = addressIdSchema.safeParse(id)
  const parsed = addressSchema.safeParse(values)
  if (!parsedId.success || !parsed.success) {
    return { error: ADDRESS_INVALID }
  }

  const result = await updateAddress(parsedId.data, parsed.data)
  if (!result.ok) return addressErrorFor(result)

  revalidatePath('/account/addresses')
  return {}
}

/** Deletes a saved address, promoting a new default if this one held it (see `data.ts`). */
export async function removeAddress(id: string): Promise<AccountActionResult> {
  const parsedId = addressIdSchema.safeParse(id)
  if (!parsedId.success) {
    return { error: ADDRESS_GONE }
  }

  const result = await deleteAddress(parsedId.data)
  if (!result.ok) return addressErrorFor(result)

  revalidatePath('/account/addresses')
  return {}
}

/** Promotes a saved address to default, clearing the previous one in the same transaction. */
export async function makeAddressDefault(id: string): Promise<AccountActionResult> {
  const parsedId = addressIdSchema.safeParse(id)
  if (!parsedId.success) {
    return { error: ADDRESS_GONE }
  }

  const result = await setDefaultAddress(parsedId.data)
  if (!result.ok) return addressErrorFor(result)

  revalidatePath('/account/addresses')
  return {}
}
