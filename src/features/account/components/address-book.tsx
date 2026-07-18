'use client'

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AddressForm } from '@/features/account/components/address-form'
import { useAuthStore } from '@/features/account/store'
import type { SavedAddress } from '@/features/account/lib/mock-user'
import type { Address } from '@/features/checkout/schema'
import { useHydrated } from '@/features/cart/use-hydrated'

type DialogState = { mode: 'add' } | { mode: 'edit'; address: SavedAddress } | null

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
 * Saved-addresses book for the customer dashboard: lists the signed-in
 * user's `SavedAddress` records with a "Default" badge, and lets them add,
 * edit, delete, or set a default address. Add/edit happens in a shared
 * `Dialog` containing `AddressForm`; hydration-gated so the persisted store
 * doesn't cause a server/client markup mismatch.
 */
export function AddressBook() {
  const hydrated = useHydrated()
  const user = useAuthStore((s) => s.user)
  const addAddress = useAuthStore((s) => s.addAddress)
  const updateAddress = useAuthStore((s) => s.updateAddress)
  const removeAddress = useAuthStore((s) => s.removeAddress)
  const setDefaultAddress = useAuthStore((s) => s.setDefaultAddress)

  const [dialogState, setDialogState] = useState<DialogState>(null)

  if (!hydrated) {
    return <div aria-hidden className="h-64 w-full animate-pulse rounded-xl bg-muted" />
  }

  const addresses = user?.addresses ?? []

  function closeDialog() {
    setDialogState(null)
  }

  function handleFormSubmit(values: Address) {
    if (dialogState?.mode === 'edit') {
      updateAddress(dialogState.address.id, values)
    } else {
      addAddress(values)
    }
    closeDialog()
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <h2 className="font-display text-lg font-semibold text-foreground">Saved addresses</h2>
        <Button type="button" onClick={() => setDialogState({ mode: 'add' })}>
          Add address
        </Button>
      </div>

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
                          onClick={() => setDefaultAddress(address.id)}
                        >
                          Set default
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setDialogState({ mode: 'edit', address })}
                      >
                        Edit
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => removeAddress(address.id)}
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
