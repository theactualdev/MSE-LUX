'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { subscribe } from '@/features/newsletter/actions'

/**
 * Footer newsletter signup (Phase 10a — real at last; until then this was a
 * disclosed no-op shell). Success REPLACES the form: the double-opt-in flow
 * means the next step happens in the subscriber's inbox, so leaving an empty
 * form implies a resubmit is wanted. The result paragraph is a `role="status"`
 * live region so the outcome is announced, not just painted.
 */
export function NewsletterForm() {
  const [email, setEmail] = useState('')
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)
  const [pending, startTransition] = useTransition()

  if (result?.ok) {
    return (
      <p role="status" className="max-w-sm text-sm text-foreground">
        {result.text}
      </p>
    )
  }

  return (
    <form
      className="flex w-full max-w-sm flex-col gap-2"
      aria-label="Newsletter signup"
      // Server-side zod in the `subscribe` action is authoritative; native
      // validation bubbles are suppressed so the error UX is consistent
      // (the aria-live region below does the announcing) — `type="email"`
      // is kept on the input for the mobile keyboard layout and autofill.
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        startTransition(async () => {
          const response = await subscribe(email)
          setResult(response.ok ? { ok: true, text: response.message } : { ok: false, text: response.error })
        })
      }}
    >
      <label htmlFor="newsletter-email" className="text-sm font-medium text-foreground">
        Join the newsletter
      </label>
      <div className="flex gap-2">
        <Input
          id="newsletter-email"
          type="email"
          required
          placeholder="you@example.com"
          className="h-12"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={pending}
        />
        <Button type="submit" className="shrink-0" disabled={pending}>
          Sign up
        </Button>
      </div>
      <p role="status" aria-live="polite" className="min-h-5 text-xs text-destructive">
        {result && !result.ok ? result.text : ''}
      </p>
    </form>
  )
}
