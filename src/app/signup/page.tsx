import type { Metadata } from 'next'
import Link from 'next/link'
import { Container } from '@/components/brand/container'
import { AuthCard } from '@/features/account/components/auth-card'
import { SignupForm } from '@/features/account/components/signup-form'
import { RedirectIfAuthed } from '@/features/account/components/redirect-if-authed'

export const metadata: Metadata = {
  title: 'Create account',
  description: 'Create your MSE Lux account.',
}

export default function SignupPage() {
  return (
    <RedirectIfAuthed>
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
    </RedirectIfAuthed>
  )
}
