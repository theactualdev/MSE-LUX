'use client'

import { useActionState, useState } from 'react'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { enterStore, type GateResult } from '@/features/gate/actions'

/**
 * The password form half of the gate page. A plain server-action form on
 * purpose: it submits and works with JavaScript disabled (full-page POST),
 * which matters here more than anywhere — this is the page that decides
 * whether the rest of the app's JavaScript is even reachable.
 *
 * The error line reserves its height (`min-h`) so an incorrect attempt never
 * shifts the layout, and announces via `role="alert"`. The entered password
 * stays in the field for immediate retry — it is never echoed anywhere else.
 */
export function GateForm({ from }: { from: string }) {
  const [state, formAction, isPending] = useActionState<GateResult, FormData>(enterStore, {})
  const [visible, setVisible] = useState(false)

  return (
    <form action={formAction} className="flex w-full flex-col gap-4 text-left" noValidate>
      <input type="hidden" name="from" value={from} />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="gate-password">Password</Label>
        <div className="relative">
          <Input
            id="gate-password"
            name="password"
            type={visible ? 'text' : 'password'}
            autoComplete="current-password"
            autoFocus
            required
            disabled={isPending}
            aria-invalid={!!state.error}
            aria-describedby={state.error ? 'gate-error' : undefined}
            className="h-12 pr-11 text-base"
          />
          <button
            type="button"
            onClick={() => setVisible((current) => !current)}
            aria-label={visible ? 'Hide password' : 'Show password'}
            disabled={isPending}
            className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {visible ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
          </button>
        </div>
        {/* Reserved height: the error appearing must not push the button down. */}
        <p id="gate-error" role="alert" className="min-h-5 text-sm text-destructive">
          {state.error ?? ''}
        </p>
      </div>

      <Button type="submit" disabled={isPending} className="h-12 w-full text-base">
        {isPending ? (
          <>
            <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            Entering&hellip;
          </>
        ) : (
          'Enter Store'
        )}
      </Button>
    </form>
  )
}
