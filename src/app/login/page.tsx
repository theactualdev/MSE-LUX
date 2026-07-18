import type { Metadata } from 'next'
import Link from 'next/link'
import { Container } from '@/components/brand/container'
import { AuthCard } from '@/features/account/components/auth-card'
import { LoginForm } from '@/features/account/components/login-form'
import { RedirectIfAuthed } from '@/features/account/components/redirect-if-authed'

export const metadata: Metadata = {
  title: 'Sign in',
  description: 'Sign in to your MSE Lux account.',
}

export default function LoginPage() {
  return (
    <RedirectIfAuthed>
      <Container className="flex flex-col gap-8 py-12 sm:py-16">
        <AuthCard
          title="Sign in"
          subtitle="Welcome back. Enter your details to continue."
          footer={
            <div className="flex flex-col gap-2">
              <p>
                <Link href="/forgot-password" className="text-accent hover:underline">
                  Forgot your password?
                </Link>
              </p>
              <p>
                New here?{' '}
                <Link href="/signup" className="text-accent hover:underline">
                  Create an account
                </Link>
              </p>
            </div>
          }
        >
          <LoginForm />
        </AuthCard>
      </Container>
    </RedirectIfAuthed>
  )
}
