import type { Metadata } from 'next'
import Link from 'next/link'
import { Container } from '@/components/brand/container'
import { AuthCard } from '@/features/account/components/auth-card'
import { SignupForm } from '@/features/account/components/signup-form'
import { redirectIfAuthenticated } from '@/features/auth/redirect-if-authed'

export const metadata: Metadata = {
  title: 'Create account',
  description: 'Create your MSE Lux account.',
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
