import type { Metadata } from 'next'
import Link from 'next/link'
import { Container } from '@/components/brand/container'
import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { subscriberExistsByToken } from '@/features/newsletter/subscription'
import { confirmUnsubscribe } from '@/features/newsletter/actions'

export const metadata: Metadata = {
  title: 'Unsubscribe',
  robots: { index: false, follow: false },
}

/**
 * Public and UNAUTHENTICATED on purpose: this is clicked from an email
 * client, where the reader has no session. The token is the capability.
 *
 * AMENDED after the whole-branch review (owner decision, 2026-07-31): the
 * GET must not mutate — it only probes whether the token exists and renders
 * a confirmation form. Only the form's POST (`confirmUnsubscribe`) changes
 * state, landing on `?done=1` so a refresh, or a mail-gateway re-scan of the
 * same GET, re-fires nothing.
 */
export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const token = typeof params.token === 'string' ? params.token : ''
  const done = params.done === '1'

  const exists = done ? false : await subscriberExistsByToken(token)

  return (
    <Container className="flex min-h-[50vh] flex-col items-center justify-center gap-4 py-16 text-center">
      {done ? (
        <>
          <h1 className="font-display text-3xl font-semibold text-foreground">You&apos;re unsubscribed</h1>
          <p className="max-w-md text-sm text-muted-foreground">
            You won&apos;t receive any more newsletter emails from us. Changed your mind? Sign up again any time
            from the bottom of any page.
          </p>
        </>
      ) : exists ? (
        <>
          <h1 className="font-display text-3xl font-semibold text-foreground">Unsubscribe from our newsletter</h1>
          <p className="max-w-md text-sm text-muted-foreground">
            You&apos;ll stop receiving newsletter emails from us. You can sign up again any time.
          </p>
          <form action={confirmUnsubscribe}>
            <input type="hidden" name="token" value={token} />
            <Button type="submit">Yes, unsubscribe me</Button>
          </form>
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
