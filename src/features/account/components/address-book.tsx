'use client'

import { useState, useTransition } from 'react'
import { unstable_rethrow } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AddressForm } from '@/features/account/components/address-form'
import {
  addAddress,
  editAddress,
  makeAddressDefault,
  removeAddress,
  type AccountActionResult,
} from '@/features/account/actions'
import type { SavedAddress } from '@/features/account/data'
import type { Address } from '@/features/checkout/schema'

type DialogState = { mode: 'add' } | { mode: 'edit'; address: SavedAddress } | null

const GENERIC_ERROR = 'Something went wrong. Please try again.'

interface AddressBookProps {
  /** The signed-in user's saved addresses, read server-side (default first). */
  addresses: SavedAddress[]
}

/** Renders a saved address as a formatted block (no PII beyond what's stored). */
function formatAddressLines(address: SavedAddress): string[] {
  const lineTwo = [address.city, address.state, address.country].filter(Boolean).join(', ')
  return [
    address.line1 + (address.line2 ? `, ${address.line2}` : ''),
    lineTwo + (address.postalCode ? ` ${address.postalCode}` : ''),
    address.phone,
  ]
}

/**
 * Saved-addresses book for the customer dashboard: lists the signed-in user's
 * stored addresses with a "Default" badge, and lets them add, edit, delete, or
 * set a default address. Add/edit happens in a shared `Dialog` containing
 * `AddressForm`.
 *
 * The list arrives as a server-rendered prop and every mutation goes through a
 * Server Action that scopes the write to the session user and calls
 * `revalidatePath('/account/addresses')`. That revalidation is what refreshes
 * `addresses` — this component keeps no local copy of the list, so what's on
 * screen after a mutation is what the database actually holds rather than an
 * optimistic guess that could silently diverge (a rejected write used to be
 * invisible under the mock store).
 *
 * No hydration gate any more: with the data server-rendered instead of read
 * from persisted client storage, first paint is already correct.
 */
export function AddressBook({ addresses }: AddressBookProps) {
  const [dialogState, setDialogState] = useState<DialogState>(null)
  const [error, setError] = useState<string | undefined>(undefined)
  const [pending, startTransition] = useTransition()

  function closeDialog() {
    setDialogState(null)
  }

  /**
   * Runs a mutation inside a transition so the revalidated server render is
   * what re-renders the list. `pending` disables the row actions meanwhile,
   * which also stops a double-click from firing two `setDefault` writes at
   * once — the second would race the first against the
   * `Address_one_default_per_profile` partial unique index.
   */
  function run(action: () => Promise<AccountActionResult>) {
    setError(undefined)
    startTransition(async () => {
      let result
      try {
        result = await action()
      } catch (caught) {
        unstable_rethrow(caught)
        setError(GENERIC_ERROR)
        return
      }
      if (result.error) setError(result.error)
    })
  }

  function handleFormSubmit(values: Address) {
    const editing = dialogState?.mode === 'edit' ? dialogState.address.id : null
    closeDialog()
    run(() => (editing ? editAddress(editing, values) : addAddress(values)))
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <h2 className="font-display text-lg font-semibold text-foreground">Saved addresses</h2>
        <Button type="button" onClick={() => setDialogState({ mode: 'add' })}>
          Add address
        </Button>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {addresses.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-16 text-center">
          <h3 className="font-display text-lg font-semibold text-foreground">No saved addresses yet</h3>
          <p className="max-w-sm text-sm text-muted-foreground">
            Add an address to speed through checkout next time.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {addresses.map((address) => {
            const [line1, line2, phone] = formatAddressLines(address)
            return (
              <li key={address.id}>
                <Card>
                  <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-foreground">{address.fullName}</span>
                        {address.isDefault ? <Badge variant="secondary">Default</Badge> : null}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {line1}
                        <br />
                        {line2}
                        <br />
                        {phone}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {!address.isDefault ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={pending}
                          onClick={() => run(() => makeAddressDefault(address.id))}
                        >
                          Set default
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={pending}
                        onClick={() => setDialogState({ mode: 'edit', address })}
                      >
                        Edit
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={pending}
                        onClick={() => run(() => removeAddress(address.id))}
                      >
                        Delete
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </li>
            )
          })}
        </ul>
      )}

      <Dialog
        open={dialogState !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) closeDialog()
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialogState?.mode === 'edit' ? 'Edit address' : 'Add address'}</DialogTitle>
          </DialogHeader>
          <AddressForm
            key={dialogState?.mode === 'edit' ? dialogState.address.id : 'add'}
            defaultValues={dialogState?.mode === 'edit' ? dialogState.address : undefined}
            submitLabel={dialogState?.mode === 'edit' ? 'Save' : 'Add address'}
            onSubmit={handleFormSubmit}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}
