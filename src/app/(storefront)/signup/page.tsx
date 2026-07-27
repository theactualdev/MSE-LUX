import type { Metadata } from 'next'
import Link from 'next/link'
import { Container } from '@/components/brand/container'
import { AuthCard } from '@/features/account/components/auth-card'
import { SignupForm } from '@/features/account/components/signup-form'
import { redirectIfAuthenticated } from '@/features/auth/redirect-if-authed'

// `robots.txt` disallows `/signup`, but a disallow only stops crawling — it
// can't stop indexing of a URL Google already discovered via a link (e.g.
// the "Create an account" nav item), and a disallowed page's own `noindex`
// is never even seen since the crawler is blocked from fetching it. The
// page-level directive here is what actually keeps this linked page out of
// the index.
export const metadata: Metadata = {
  title: 'Create account',
  description: 'Create your MSE Lux account.',
  robots: { index: false },
}

/** An already-signed-in visitor is sent to `/account` server-side, before any markup renders. */
export default async function SignupPage() {
  await redirectIfAuthenticated()

  return (
    <Container className="flex flex-col gap-8 py-12 sm:py-16">
      <AuthCard
        title="Create account"
        subtitle="Join MSE Lux to track orders and save your details."
        footer={
          <p>
            Already have an account?{' '}
            <Link href="/login" className="text-accent hover:underline">
              Sign in
            </Link>
          </p>
        }
      >
        <SignupForm />
      </AuthCard>
    </Container>
  )
}
