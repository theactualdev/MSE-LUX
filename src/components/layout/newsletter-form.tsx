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
    </form>
  )
}
