import type { Metadata } from 'next'
import Link from 'next/link'
import { Container } from '@/components/brand/container'
import { AuthCard } from '@/features/account/components/auth-card'
import { ForgotPasswordForm } from '@/features/account/components/forgot-password-form'
import { redirectIfAuthenticated } from '@/features/auth/redirect-if-authed'

// `robots.txt` disallows `/forgot-password`, but a disallow only stops
// crawling — it can't stop indexing of a URL Google already discovered via a
// link (e.g. the "Forgot your password?" link on `/login`), and a disallowed
// page's own `noindex` is never even seen since the crawler is blocked from
// fetching it. The page-level directive here is what actually keeps this
// linked page out of the index.
export const metadata: Metadata = {
  title: 'Reset your password',
  description: 'Request a password reset link for your MSE Lux account.',
  robots: { index: false },
}

/**
 * An already-signed-in visitor is sent to `/account` server-side. Note the
 * contrast with `/reset-password`, which deliberately has no such guard —
 * Supabase's recovery link signs the user in before they land there.
 */
export default async function ForgotPasswordPage() {
  await redirectIfAuthenticated()

  return (
    <Container className="flex flex-col gap-8 py-12 sm:py-16">
      <AuthCard
        title="Reset your password"
        subtitle="Enter your email and we'll send you a link to reset your password."
        footer={
          <p>
            Remembered it?{' '}
            <Link href="/login" className="text-accent hover:underline">
              Sign in
            </Link>
          </p>
        }
      >
        <ForgotPasswordForm />
      </AuthCard>
    </Container>
  )
}
