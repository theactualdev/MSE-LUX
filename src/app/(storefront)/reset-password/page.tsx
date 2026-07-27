import type { Metadata } from 'next'
import { Container } from '@/components/brand/container'
import { AuthCard } from '@/features/account/components/auth-card'
import { ResetPasswordForm } from '@/features/account/components/reset-password-form'

// `robots.txt` disallows `/reset-password`, but a disallow only stops
// crawling — it can't stop indexing of a URL Google already discovered via a
// link (Supabase's recovery email links here), and a disallowed page's own
// `noindex` is never even seen since the crawler is blocked from fetching
// it. The page-level directive here is what actually keeps this linked page
// out of the index.
export const metadata: Metadata = {
  title: 'Set a new password',
  description: 'Set a new password for your MSE Lux account.',
  robots: { index: false },
}

/**
 * Deliberately does NOT call `redirectIfAuthenticated()`, unlike the other
 * auth pages (`/login`, `/signup`, `/forgot-password`). Supabase's recovery
 * link establishes a session before the user ever reaches this page (via the
 * callback route), so a signed-in user is the *expected* visitor here, not an
 * edge case to bounce to `/account`. Adding that guard would make the reset
 * flow unreachable by construction — see
 * docs/phases/phase-2-storefront/2d-auth-dashboard/summary.md, which flagged
 * this as a follow-up for the real token flow.
 *
 * That this page is reachable by an *ordinary* authenticated session is
 * exactly why `updatePassword` gates on `hasRecentRecoveryAuth()` rather than
 * on the route — see `claims.ts`.
 */
export default function ResetPasswordPage() {
  return (
    <Container className="flex flex-col gap-8 py-12 sm:py-16">
      <AuthCard title="Set a new password" subtitle="Choose a new password for your account.">
        <ResetPasswordForm />
      </AuthCard>
    </Container>
  )
}
