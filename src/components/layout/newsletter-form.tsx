'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { subscribe } from '@/features/newsletter/actions'

/**
 * Footer newsletter signup (Phase 10a — real at last; until then this was a
 * disclosed no-op shell). Success REMOVES the label/input/button (the
 * double-opt-in flow means the next step happens in the subscriber's inbox,
 * so leaving an empty form implies a resubmit is wanted) but the `form`
 * landmark and its `role="status"` paragraph stay mounted for both outcomes.
 *
 * That single status paragraph is in the DOM from first render and only
 * ever gets a content CHANGE — never a fresh mount already containing text.
 * Screen readers often fail to announce a live region that mounts
 * pre-populated, and the old success-only render additionally unmounted the
 * whole form, dropping keyboard focus to `<body>`. Success now also moves
 * focus onto the status paragraph (`tabIndex={-1}` + ref) so the outcome is
 * both announced and where focus lands next.
 */
export function NewsletterForm() {
  const [email, setEmail] = useState('')
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)
  const [pending, startTransition] = useTransition()
  const statusRef = useRef<HTMLParagraphElement>(null)

  useEffect(() => {
    if (result?.ok) {
      statusRef.current?.focus()
    }
  }, [result])

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
      {!result?.ok && (
        <>
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
        </>
      )}
      <p
        ref={statusRef}
        role="status"
        aria-live="polite"
        tabIndex={-1}
        className={`min-h-5 text-xs ${result?.ok ? 'text-foreground' : 'text-destructive'}`}
      >
        {result ? result.text : ''}
      </p>
    </form>
  )
}
