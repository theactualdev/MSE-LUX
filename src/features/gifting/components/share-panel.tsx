'use client'

import { useState, useTransition, type ReactNode } from 'react'
import Link from 'next/link'
import { unstable_rethrow } from 'next/navigation'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  enableShareAction,
  disableShareAction,
  regenerateShareAction,
  type ShareActionResult,
} from '@/features/gifting/actions'
import type { ShareState } from '@/features/gifting/share'
import type { SavedAddress } from '@/features/account/data'
import { env } from '@/lib/env'
import { cn } from '@/lib/utils'

interface SharePanelProps {
  /**
   * Server-read share state for the signed-in owner, or `null` when the
   * visitor is signed out. A guest wishlist lives only in `localStorage` and
   * has no server identity, so there is nothing to share and no state to
   * read — `null` is the "signed out" signal, not a loading placeholder.
   */
  shareState: ShareState | null
  /** The owner's saved addresses (server-read, default first). Empty when signed out. */
  addresses: SavedAddress[]
}

const GENERIC_ERROR = 'Something went wrong. Please try again.'
const REGENERATE_CONFIRM =
  'Regenerating creates a new link and breaks every link you have already sent out. Continue?'

/**
 * `${city}, ${state}` — deliberately never the street. This is exactly what
 * `resolveShare` hands a buyer (`recipientFirstName`/`city`/`state`, never
 * `address`), so showing the owner the same slice lets them judge what
 * they've actually exposed rather than what they typed into the address
 * form.
 */
function localityLabel(address: Pick<SavedAddress, 'city' | 'state'>): string {
  return `${address.city}, ${address.state}`
}

function SharePanelShell({ children }: { children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Share this wishlist</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col items-start gap-4">{children}</CardContent>
    </Card>
  )
}

/**
 * Owner-side share management for `/wishlist`. Four states driven entirely
 * by server-read props (never client-fetched), matching `AddressBook`'s
 * convention: every mutation runs a Server Action inside a transition and
 * relies on that action's `revalidatePath('/wishlist')` to refresh
 * `shareState`/`addresses` from the database — this component keeps no
 * local mirror of either.
 *
 * - signed-out (`shareState === null`): a sign-in prompt, no share controls.
 * - no-address (`addresses.length === 0`): a prompt to add one, no enable
 *   control — a gift needs somewhere to go, so this is a real gate rather
 *   than a soft nudge.
 * - not-shared: an address select plus "Create share link".
 * - shared (`shareState.enabled` AND a token AND the nominated address is
 *   still among `addresses`): the share URL with a copy control, the
 *   nominated address's city/state, Disable, and Regenerate (behind a
 *   `window.confirm`, since it invalidates every link already sent).
 */
export function SharePanel({ shareState, addresses }: SharePanelProps) {
  const signedIn = shareState !== null

  const [selectedAddressId, setSelectedAddressId] = useState(addresses[0]?.id ?? '')
  const [error, setError] = useState<string | undefined>(undefined)
  const [copied, setCopied] = useState(false)
  const [pending, startTransition] = useTransition()

  /**
   * Runs a share mutation inside a transition, mirroring `AddressBook`'s
   * `run()` — including the `unstable_rethrow` guard for Next's own
   * control-flow throws, even though none of these three actions currently
   * redirect/notFound, so a future one that does doesn't get its throw
   * swallowed here.
   */
  function run(action: () => Promise<ShareActionResult>) {
    setError(undefined)
    setCopied(false)
    startTransition(async () => {
      let result: ShareActionResult
      try {
        result = await action()
      } catch (caught) {
        try {
          unstable_rethrow(caught)
        } catch {
          return
        }
        setError(GENERIC_ERROR)
        return
      }
      if (!result.ok) setError(result.error)
    })
  }

  async function handleCopy(url: string) {
    if (typeof navigator === 'undefined' || !navigator.clipboard) return
    await navigator.clipboard.writeText(url)
    setCopied(true)
  }

  function handleRegenerateClick() {
    // Destructive: it invalidates every link the owner has already handed
    // out. `window.confirm` is the accepted lightweight gate for this in the
    // codebase's client components; tests mock it.
    if (!window.confirm(REGENERATE_CONFIRM)) return
    run(regenerateShareAction)
  }

  if (!signedIn) {
    return (
      <SharePanelShell>
        <p className="text-sm text-muted-foreground">
          Sign in to create a shareable link so friends and family can send you a gift from this wishlist.
        </p>
        <Link href="/login" className={cn(buttonVariants({ variant: 'outline' }))}>
          Sign in
        </Link>
      </SharePanelShell>
    )
  }

  if (addresses.length === 0) {
    return (
      <SharePanelShell>
        <p className="text-sm text-muted-foreground">
          Add a delivery address before you can share your wishlist — a gift needs somewhere to go.
        </p>
        <Link href="/account/addresses" className={cn(buttonVariants({ variant: 'outline' }))}>
          Add a delivery address
        </Link>
      </SharePanelShell>
    )
  }

  const nominatedAddress = shareState.addressId
    ? addresses.find((address) => address.id === shareState.addressId)
    : undefined

  // `enabled` alone isn't enough: `giftAddress` is `onDelete: SetNull`, so a
  // deleted address can leave `enabled: true` with `addressId: null` (or
  // pointing at an address no longer in this list). Without a resolvable
  // address there is nothing buyer-safe to show, so that combination falls
  // through to the "not-shared" state below rather than rendering a broken
  // link. Checking `nominatedAddress` itself (not a separately-computed
  // boolean) is what lets TypeScript narrow it to `SavedAddress` below.
  if (!shareState.enabled || !shareState.token || !nominatedAddress) {
    return (
      <SharePanelShell>
        <p className="text-sm text-muted-foreground">
          Choose which saved address gift-givers should send to. Only its city and state are ever shown to
          them — never the street address.
        </p>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <Select value={selectedAddressId} onValueChange={(value) => setSelectedAddressId(value as string)}>
          <SelectTrigger aria-label="Delivery address" className="w-full sm:w-72">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {addresses.map((address) => (
                <SelectItem key={address.id} value={address.id}>
                  {address.fullName} — {localityLabel(address)}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <Button
          type="button"
          disabled={pending || !selectedAddressId}
          onClick={() => run(() => enableShareAction(selectedAddressId))}
        >
          Create share link
        </Button>
      </SharePanelShell>
    )
  }

  const shareUrl = `${env.NEXT_PUBLIC_SITE_URL}/wishlist/shared/${shareState.token}`

  return (
    <SharePanelShell>
      <p className="text-sm text-muted-foreground">
        Anyone with this link can see your wishlist and send a gift to {localityLabel(nominatedAddress)}.
      </p>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex w-full flex-col gap-2 sm:flex-row">
        <Input
          readOnly
          aria-label="Share link"
          value={shareUrl}
          onFocus={(event) => event.currentTarget.select()}
        />
        <Button type="button" variant="outline" className="shrink-0" onClick={() => handleCopy(shareUrl)}>
          Copy link
        </Button>
      </div>
      {/* Mounted from first render of this state, always — only its text
          content changes on copy. A region created already populated (e.g.
          `{copied && <div role="status">…</div>}`) is frequently not
          announced, because the live region has nothing to observe a
          mutation against. */}
      <div role="status" className="text-sm text-muted-foreground">
        {copied ? 'Copied to clipboard.' : ''}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={pending} onClick={() => run(disableShareAction)}>
          Disable sharing
        </Button>
        <Button type="button" variant="outline" disabled={pending} onClick={handleRegenerateClick}>
          Regenerate link
        </Button>
      </div>
    </SharePanelShell>
  )
}
