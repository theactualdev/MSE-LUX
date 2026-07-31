import type { Metadata } from 'next'
import Link from 'next/link'
import { Container } from '@/components/brand/container'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { unsubscribeByToken } from '@/features/newsletter/subscription'

export const metadata: Metadata = {
  title: 'Unsubscribe',
  robots: { index: false, follow: false },
}

/**
 * Public and UNAUTHENTICATED on purpose: this is clicked from an email
 * client, where the reader has no session. The token is the capability.
 * Idempotent via the engine; unknown tokens get the same neutral page as
 * the confirm route.
 */
export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const token = typeof params.token === 'string' ? params.token : ''
  const result = await unsubscribeByToken(token)

  return (
    <Container className="flex min-h-[50vh] flex-col items-center justify-center gap-4 py-16 text-center">
      {result === 'unsubscribed' ? (
        <>
          <h1 className="font-display text-3xl font-semibold text-foreground">You&apos;re unsubscribed</h1>
          <p className="max-w-md text-sm text-muted-foreground">
            You won&apos;t receive any more newsletter emails from us. Changed your mind? Sign up again any time
            from the bottom of any page.
          </p>
        </>
      ) : (
        <>
          <h1 className="font-display text-3xl font-semibold text-foreground">This link isn&apos;t valid</h1>
          <p className="max-w-md text-sm text-muted-foreground">
            The unsubscribe link is invalid. If you keep receiving emails you don&apos;t want, use the
            unsubscribe link in the most recent one.
          </p>
        </>
      )}
      <Link href="/" className={cn(buttonVariants())}>
        Back to the store
      </Link>
    </Container>
  )
}
