'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

/** Non-functional newsletter signup — captures no data yet, just the shell UI. */
export function NewsletterForm() {
  return (
    <form
      className="flex w-full max-w-sm flex-col gap-2"
      onSubmit={(e) => e.preventDefault()}
      aria-label="Newsletter signup"
    >
      <label htmlFor="newsletter-email" className="text-sm font-medium text-foreground">
        Join the newsletter
      </label>
      <div className="flex gap-2">
        <Input id="newsletter-email" type="email" placeholder="you@example.com" className="h-12" />
        <Button type="submit" className="shrink-0">
          Sign up
        </Button>
      </div>
      {/* The form captures nothing. Soliciting an address without saying so is the
          same over-promise as a policy claim the code can't honour — disclose it,
          exactly as ContactForm does, until a real list exists. */}
      <p className="text-xs text-muted-foreground">Sign-ups aren&apos;t being collected yet — nothing is stored.</p>
    </form>
  )
}
