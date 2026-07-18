import type { Metadata } from 'next'
import { Container } from '@/components/brand/container'
import { AuthCard } from '@/features/account/components/auth-card'
import { ResetPasswordForm } from '@/features/account/components/reset-password-form'
import { RedirectIfAuthed } from '@/features/account/components/redirect-if-authed'

export const metadata: Metadata = {
  title: 'Set a new password',
  description: 'Set a new password for your MSE Lux account.',
}

export default function ResetPasswordPage() {
  return (
    <RedirectIfAuthed>
      <Container className="flex flex-col gap-8 py-12 sm:py-16">
        <AuthCard title="Set a new password" subtitle="Choose a new password for your account.">
          <ResetPasswordForm />
        </AuthCard>
      </Container>
    </RedirectIfAuthed>
  )
}
