import type { Metadata } from 'next'
import Link from 'next/link'
import { Container } from '@/components/brand/container'
import { AuthCard } from '@/features/account/components/auth-card'
import { ForgotPasswordForm } from '@/features/account/components/forgot-password-form'
import { RedirectIfAuthed } from '@/features/account/components/redirect-if-authed'

export const metadata: Metadata = {
  title: 'Reset your password',
  description: 'Request a password reset link for your MSE Lux account.',
}

export default function ForgotPasswordPage() {
  return (
    <RedirectIfAuthed>
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
    </RedirectIfAuthed>
  )
}
