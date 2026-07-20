'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { signInWithGoogle } from '@/features/auth/actions'

const GENERIC_ERROR = 'Something went wrong. Please try again.'

interface GoogleAuthButtonProps {
  /** Reports a failure so the parent form can surface it in its existing `role="alert"` region, rather than this button owning a second one. */
  onError: (message: string) => void
}

/**
 * "Continue with Google" button shared by the login and signup screens.
 * Styled `outline` (secondary emphasis) deliberately — the email form stays
 * the primary path, this is the alternative below it.
 *
 * Unlike `signIn`/`signUp`/`updatePassword`, `signInWithGoogle` never calls
 * `redirect()` (it can't: a Server Action runs on the server with no
 * `window`, and the destination is `accounts.google.com`, an origin Next's
 * client router has no way to navigate to anyway) — it resolves with
 * `{ url }` instead, so there's no `NEXT_REDIRECT` control-flow rejection to
 * classify here the way `reset-password-form.tsx` does with
 * `unstable_rethrow`. The `catch` below only ever meets a genuine transport
 * failure.
 */
export function GoogleAuthButton({ onError }: GoogleAuthButtonProps) {
  const [isPending, setIsPending] = useState(false)

  return (
    <Button
      type="button"
      variant="outline"
      className="w-full"
      disabled={isPending}
      onClick={async () => {
        setIsPending(true)
        let result
        try {
          result = await signInWithGoogle()
        } catch {
          setIsPending(false)
          onError(GENERIC_ERROR)
          return
        }
        if (!result.url) {
          setIsPending(false)
          onError(result.error ?? GENERIC_ERROR)
          return
        }
        // Full-page navigation to Google's consent screen — a different
        // origin entirely, so this is a real browser navigation, not a
        // Next router push. No `setIsPending(false)` on this path: the page
        // is about to unload, so there's nothing to re-enable for.
        window.location.href = result.url
      }}
    >
      <GoogleIcon aria-hidden="true" />
      Continue with Google
    </Button>
  )
}

/** Google's four-colour "G" mark, inlined (no icon dependency — see CLAUDE.md's "no new dependencies"). */
function GoogleIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" {...props}>
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.63h6.47a5.54 5.54 0 0 1-2.4 3.63v3h3.88c2.27-2.09 3.57-5.17 3.57-8.81Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.95-2.92l-3.88-3c-1.08.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.26v3.11A11.999 11.999 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.27a7.2 7.2 0 0 1 0-4.54v-3.1H1.26a12 12 0 0 0 0 10.75l4.01-3.11Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.77c1.76 0 3.34.6 4.59 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.69 1.26 6.63l4.01 3.1C6.22 6.88 8.87 4.77 12 4.77Z"
      />
    </svg>
  )
}
