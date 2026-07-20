import type { Metadata } from 'next'
import Link from 'next/link'
import { Container } from '@/components/brand/container'
import { AuthCard } from '@/features/account/components/auth-card'
import { LoginForm } from '@/features/account/components/login-form'
import { RedirectIfAuthed } from '@/features/account/components/redirect-if-authed'
import { callbackErrorMessage } from '@/features/auth/callback-errors'

export const metadata: Metadata = {
  title: 'Sign in',
  description: 'Sign in to your MSE Lux account.',
}

interface LoginPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

/**
 * A Server Component (this page reads `searchParams` itself, so it stays
 * server-rendered rather than reaching for `useSearchParams` in a Client
 * Component — see `callback-errors.ts`) wrapping the Client Component that
 * owns the actual form. `/auth/callback` (`route.ts`) redirects failures
 * here with `?error=...`; resolving that to display copy up here and
 * handing it down as a prop means `LoginForm` doesn't need its own
 * search-param plumbing, and the message lands in the `role="alert"` region
 * it already has, rather than new UI.
 */
export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { error } = await searchParams
  const initialError = callbackErrorMessage(error)

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
          <LoginForm initialError={initialError} />
        </AuthCard>
      </Container>
    </RedirectIfAuthed>
  )
}
