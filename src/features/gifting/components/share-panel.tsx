'use client'

import { useEffect, useState, useTransition, type ReactNode } from 'react'
import Link from 'next/link'
import { unstable_rethrow } from 'next/navigation'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  enableShareAction,
  disableShareAction,
  regenerateShareAction,
  getSharePanelDataAction,
  type ShareActionResult,
  type SharePanelAddress,
  type SharePanelData,
} from '@/features/gifting/actions'
import { useSession } from '@/features/auth/use-session'
import { env } from '@/lib/env'
import { cn } from '@/lib/utils'

const GENERIC_ERROR = 'Something went wrong. Please try again.'
const REGENERATE_CONFIRM =
  'Regenerating creates a new link and breaks every link you have already sent out. Continue?'

/**
 * `${city}, ${state}` — deliberately never the street. This is exactly what
 * `resolveShare` hands a buyer (`recipientFirstName`/`city`/`state`, never
 * `address`), so showing the owner the same slice lets them judge what
 * they've actually exposed rather than what they typed into the address
 * form. `getSharePanelDataAction` already strips the street server-side, so
 * `SharePanelAddress` structurally has nowhere to leak it from — this is
 * belt-and-braces on top of that.
 */
function localityLabel(address: Pick<SharePanelAddress, 'city' | 'state'>): string {
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
 * Owner-side share management for `/wishlist`. Client-fetched after mount
 * (not server-read props): `/wishlist`'s server shell is otherwise fully
 * static (see that page's header comment), and a guest wishlist has no
 * server identity to share in the first place, so this is the one piece of
 * personalisation on the page and it stays entirely on the client, matching
 * how `useWishlist()` itself splits guest-localStorage from
 * signed-in-server-fetched.
 *
 * Five states:
 * - loading (`useSession()` still settling, or settled signed-in but the
 *   fetch hasn't resolved yet): the shell with a skeleton frame — reserves
 *   the same layout rather than popping in once data lands.
 * - signed-out (`useSession().signedIn === false`, checked BEFORE any fetch
 *   — a guest never calls the action at all): a sign-in prompt, no share
 *   controls.
 * - no-address (`addresses.length === 0`): a prompt to add one, no enable
 *   control — a gift needs somewhere to go, so this is a real gate rather
 *   than a soft nudge.
 * - not-shared: an address select plus "Create share link".
 * - shared (`shareState.enabled` AND a token AND the nominated address is
 *   still among `addresses`): the share URL with a copy control, the
 *   nominated address's city/state, Disable, and Regenerate (behind a
 *   `window.confirm`, since it invalidates every link already sent).
 *
 * `useSession()` is UX-only (see its own header) — it decides *whether* to
 * call `getSharePanelDataAction` at all, never what the panel is allowed to
 * show. The action re-derives identity from the verified session itself; if
 * it ever disagrees with the client's cookie read (session expired between
 * mount and the fetch settling, say) its `null` wins and the panel falls
 * back to the sign-in prompt rather than trusting the stale client guess.
 */
export function SharePanel() {
  const { signedIn, loading: authLoading } = useSession()

  const [data, setData] = useState<SharePanelData | null>(null)
  // Whether the CURRENT signed-in session's fetch has settled (success or
  // failure) at least once — not a generic "is fetching" flag. Only ever
  // set from inside the promise's `.finally()` (an async callback, not the
  // effect's own synchronous body) so the effect itself never calls
  // `setState` synchronously, which `react-hooks/set-state-in-effect` flags.
  // It's safe for this to latch `true` and stay there: signing in and
  // signing out both force a navigation elsewhere in this app (see
  // `useSession`'s own header), so this component is never asked to handle
  // an in-place sign-out/sign-in swap on the SAME mount — there is no second
  // "current session" for it to go stale against.
  const [dataReady, setDataReady] = useState(false)
  const [selectedAddressId, setSelectedAddressId] = useState('')
  const [error, setError] = useState<string | undefined>(undefined)
  const [copied, setCopied] = useState(false)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    // `useSession` starts every mount at `loading: true` before it confirms
    // the cookie (see its own header) — wait for it to settle rather than
    // firing a fetch off a guess. A signed-out visitor never calls the
    // action at all: their wishlist has no server identity to share, so
    // there is nothing to fetch.
    if (authLoading || !signedIn) return
    let active = true
    getSharePanelDataAction()
      .then((result) => {
        if (!active) return
        setData(result)
        setSelectedAddressId(result?.addresses[0]?.id ?? '')
      })
      .catch((caughtError: unknown) => {
        console.error('[SharePanel] getSharePanelDataAction failed', caughtError)
        if (active) setData(null)
      })
      .finally(() => {
        if (active) setDataReady(true)
      })
    return () => {
      active = false
    }
  }, [authLoading, signedIn])

  /**
   * Runs a share mutation inside a transition, mirroring `AddressBook`'s
   * `run()` — including the `unstable_rethrow` guard for Next's own
   * control-flow throws, even though none of these three actions currently
   * redirect/notFound, so a future one that does doesn't get its throw
   * swallowed here. On success, re-fetches the panel's data instead of
   * relying on `revalidatePath` + a server re-render to hand back fresh
   * props — there are no props anymore, so this is the client-side
   * equivalent, and it runs inside the same transition so the buttons stay
   * disabled until the refreshed state is in hand.
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
      if (!result.ok) {
        setError(result.error)
        return
      }
      try {
        const refreshed = await getSharePanelDataAction()
        setData(refreshed)
        setSelectedAddressId((current) =>
          refreshed?.addresses.some((address) => address.id === current)
            ? current
            : (refreshed?.addresses[0]?.id ?? ''),
        )
      } catch (caughtError) {
        console.error('[SharePanel] refresh after mutation failed', caughtError)
      }
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

  if (authLoading || (signedIn && !dataReady)) {
    return (
      <SharePanelShell>
        <Skeleton className="h-4 w-full max-w-sm" />
        <Skeleton className="h-9 w-40" />
      </SharePanelShell>
    )
  }

  if (!signedIn || !data) {
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

  const { shareState, addresses } = data

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
  // boolean) is what lets TypeScript narrow it to `SharePanelAddress` below.
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
