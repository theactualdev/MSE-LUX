'use client'

import { Button } from '@/components/ui/button'

/** Branded admin error boundary (8a carried item) — generic copy, no internals leaked. */
export default function AdminError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="font-display text-2xl font-semibold text-foreground">Something went wrong</h1>
      <p className="text-sm text-muted-foreground">The admin panel hit an unexpected error.</p>
      <Button type="button" variant="outline" size="sm" onClick={reset}>
        Try again
      </Button>
    </main>
  )
}
