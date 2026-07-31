import type { Metadata } from 'next'
import Link from 'next/link'
import { Container } from '@/components/brand/container'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { confirmByToken } from '@/features/newsletter/subscription'

export const metadata: Metadata = {
  title: 'Confirm subscription',
  robots: { index: false, follow: false },
}

/**
 * Public, token-capability landing page for the double-opt-in email.
 * Idempotent by way of the engine (scanners and mail clients prefetch links);
 * an unknown token gets a neutral page that reveals nothing about whether it
 * ever existed.
 */
export default async function ConfirmSubscriptionPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const token = typeof params.token === 'string' ? params.token : ''
  const result = await confirmByToken(token)

  return (
    <Container className="flex min-h-[50vh] flex-col items-center justify-center gap-4 py-16 text-center">
      {result === 'confirmed' ? (
        <>
          <h1 className="font-display text-3xl font-semibold text-foreground">You&apos;re subscribed</h1>
          <p className="max-w-md text-sm text-muted-foreground">
            Thanks for confirming — we&apos;ll email you about new pieces, restocks, and the occasional offer.
            Every email includes an unsubscribe link.
          </p>
        </>
      ) : (
        <>
          <h1 className="font-display text-3xl font-semibold text-foreground">This link isn&apos;t valid</h1>
          <p className="max-w-md text-sm text-muted-foreground">
            The confirmation link is invalid or has already been used. You can sign up again from the bottom of
            any page.
          </p>
        </>
      )}
      <Link href="/" className={cn(buttonVariants())}>
        Back to the store
      </Link>
    </Container>
  )
}
