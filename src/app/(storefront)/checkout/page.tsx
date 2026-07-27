import type { Metadata } from 'next'
import { Container } from '@/components/brand/container'
import { SectionHeading } from '@/components/brand/section-heading'
import { CheckoutFlow } from '@/features/checkout/components/checkout-flow'
import { getCurrentUserEmail } from '@/features/auth/claims'
import { listAddresses } from '@/features/account/data'
import type { Contact, Address } from '@/features/checkout/schema'

export const metadata: Metadata = {
  title: 'Checkout',
  description: 'Complete your order: contact, shipping, payment, and review.',
}

/**
 * Server Component so a signed-in customer's contact and default address can
 * prefill the checkout steps. This reads request-scoped auth state, so the
 * route is dynamic — acceptable here (checkout was never a static/ISR
 * catalog page). A guest gets `null`/`[]` back from both reads, so both
 * initials are `undefined` and the forms render empty as before.
 */
export default async function CheckoutPage() {
  const [email, addresses] = await Promise.all([getCurrentUserEmail(), listAddresses()])

  const initialContact: Contact | undefined = email ? { email } : undefined

  const defaultAddress = addresses.find((a) => a.isDefault) ?? addresses[0]
  const initialAddress: Address | undefined = defaultAddress
    ? {
        fullName: defaultAddress.fullName,
        phone: defaultAddress.phone,
        line1: defaultAddress.line1,
        line2: defaultAddress.line2 || undefined,
        city: defaultAddress.city,
        state: defaultAddress.state,
        country: defaultAddress.country,
        postalCode: defaultAddress.postalCode || undefined,
      }
    : undefined

  // `isSignedIn` is derived from `email` above rather than a separate
  // `getCurrentUserId()` call: every signed-in session carries an email
  // claim, so `Boolean(email)` is equivalent to "there is a signed-in user"
  // without a second auth fetch on this already-dynamic route.
  const isSignedIn = Boolean(email)

  return (
    <Container className="flex flex-col gap-8 py-12 sm:py-16">
      <SectionHeading title="Checkout" as="h1" />
      <CheckoutFlow initialContact={initialContact} initialAddress={initialAddress} isSignedIn={isSignedIn} />
    </Container>
  )
}
