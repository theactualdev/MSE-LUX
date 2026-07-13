'use client'

import { useEffect } from 'react'
import { Container } from '@/components/brand/container'
import { Button } from '@/components/ui/button'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error(error)
  }, [error])

  return (
    <Container className="flex flex-col items-center gap-6 py-24 text-center sm:py-32">
      <h1 className="font-display text-4xl font-semibold text-foreground sm:text-5xl">
        Something went wrong
      </h1>
      <p className="max-w-md text-sm text-muted-foreground sm:text-base">
        We hit an unexpected error while loading this page. Please try again, and if the problem
        persists, reach out to us.
      </p>
      <Button onClick={() => reset()}>Try again</Button>
    </Container>
  )
}
