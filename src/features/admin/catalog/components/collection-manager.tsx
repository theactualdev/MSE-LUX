'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { createCollectionAction, updateCollectionAction, deleteCollectionAction } from '@/features/admin/catalog/actions'
import type { AdminCollectionListItem } from '@/features/admin/catalog/data'

const GENERIC_ERROR = 'Something went wrong. Please try again.'

interface CollectionManagerProps {
  collections: AdminCollectionListItem[]
}

interface FormFieldErrors {
  name?: string
  slug?: string
  description?: string
  image?: string
}

/**
 * The `/admin/catalog/collections` manager — list + create/edit/delete for
 * `Collection` rows. One dialog handles both create and edit (prefilled from
 * the row when `editingId` is set); delete asks for confirmation and is
 * explicit that it only detaches products from the collection — the
 * `ProductCollection` join rows are what's removed, never the products
 * themselves. Mirrors `DangerZone`/`OrderActions`: `useTransition` wraps
 * every action call, a successful call always ends with `router.refresh()`,
 * and errors render as `role="alert"` inside the still-open dialog (base-ui
 * marks the rest of the tree `aria-hidden` while a dialog is open, so a
 * banner outside it would be invisible to assistive tech right when it's
 * needed).
 */
export function CollectionManager({ collections }: CollectionManagerProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [description, setDescription] = useState('')
  const [image, setImage] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FormFieldErrors>({})
  const [formError, setFormError] = useState<string | undefined>(undefined)

  const [deleteTarget, setDeleteTarget] = useState<AdminCollectionListItem | null>(null)
  const [deleteError, setDeleteError] = useState<string | undefined>(undefined)

  function openCreate() {
    setEditingId(null)
    setName('')
    setSlug('')
    setDescription('')
    setImage('')
    setFieldErrors({})
    setFormError(undefined)
    setFormOpen(true)
  }

  function openEdit(collection: AdminCollectionListItem) {
    setEditingId(collection.id)
    setName(collection.name)
    setSlug(collection.slug)
    setDescription(collection.description ?? '')
    setImage(collection.image ?? '')
    setFieldErrors({})
    setFormError(undefined)
    setFormOpen(true)
  }

  function handleSubmit() {
    setFieldErrors({})
    setFormError(undefined)

    const trimmedDescription = description.trim()
    const trimmedImage = image.trim()
    const payload = {
      name: name.trim(),
      slug: slug.trim(),
      description: trimmedDescription ? trimmedDescription : null,
      // Empty means "no image", not an empty string — the column is nullable
      // and the storefront branches on null to decide whether to render a
      // tile image at all.
      image: trimmedImage ? trimmedImage : null,
    }

    startTransition(async () => {
      const result = editingId ? await updateCollectionAction(editingId, payload) : await createCollectionAction(payload)

      if (result.ok) {
        setFormOpen(false)
        router.refresh()
        return
      }

      if (result.error === 'conflict-slug') {
        setFieldErrors({ slug: 'This slug is already in use by another collection.' })
        return
      }

      if (result.error === 'invalid-input' && result.issues && result.issues.length > 0) {
        const issueMap: FormFieldErrors = {}
        for (const issue of result.issues) {
          const path = issue.path.map(String).join('.')
          if (path === 'name' || path === 'slug' || path === 'description' || path === 'image')
            issueMap[path] = issue.message
        }
        if (Object.keys(issueMap).length > 0) {
          setFieldErrors(issueMap)
          return
        }
      }

      setFormError(GENERIC_ERROR)
    })
  }

  function handleDelete() {
    if (!deleteTarget) return
    setDeleteError(undefined)
    startTransition(async () => {
      const result = await deleteCollectionAction(deleteTarget.id)
      if (result.ok) {
        setDeleteTarget(null)
        router.refresh()
        return
      }
      setDeleteError(GENERIC_ERROR)
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-end">
        <Button type="button" onClick={openCreate}>
          New collection
        </Button>
      </div>

      {collections.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
          No collections yet.
        </p>
      ) : (
        <div className="flex flex-col divide-y divide-border rounded-xl border border-border">
          {collections.map((collection) => (
            <div key={collection.id} className="flex items-center justify-between gap-4 p-4">
              <div className="flex min-w-0 flex-col gap-1">
                <span className="truncate font-display text-sm font-medium text-foreground">{collection.name}</span>
                <span className="truncate text-xs text-muted-foreground">
                  /{collection.slug} &middot; {collection.productCount} {collection.productCount === 1 ? 'product' : 'products'}
                </span>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => openEdit(collection)}>
                  Edit
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  disabled={pending}
                  onClick={() => {
                    setDeleteError(undefined)
                    setDeleteTarget(collection)
                  }}
                >
                  Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit collection' : 'New collection'}</DialogTitle>
            <DialogDescription>
              {editingId
                ? "Update this collection's name, slug, description, or tile image."
                : 'Create a new collection to group products under.'}
            </DialogDescription>
          </DialogHeader>

          {formError ? (
            <p role="alert" className="text-sm text-destructive">
              {formError}
            </p>
          ) : null}

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <Label htmlFor="cm-name">Name</Label>
              <Input id="cm-name" value={name} onChange={(e) => setName(e.target.value)} disabled={pending} />
              {fieldErrors.name ? (
                <p role="alert" className="text-sm text-destructive">
                  {fieldErrors.name}
                </p>
              ) : null}
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="cm-slug">Slug</Label>
              <Input id="cm-slug" value={slug} onChange={(e) => setSlug(e.target.value)} disabled={pending} />
              {fieldErrors.slug ? (
                <p role="alert" className="text-sm text-destructive">
                  {fieldErrors.slug}
                </p>
              ) : null}
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="cm-description">Description</Label>
              <Textarea id="cm-description" value={description} onChange={(e) => setDescription(e.target.value)} disabled={pending} />
              {fieldErrors.description ? (
                <p role="alert" className="text-sm text-destructive">
                  {fieldErrors.description}
                </p>
              ) : null}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cm-image">Tile image URL</Label>
              <Input
                id="cm-image"
                value={image}
                onChange={(e) => setImage(e.target.value)}
                disabled={pending}
                aria-invalid={!!fieldErrors.image}
                placeholder="https://..."
              />
              <p className="text-xs text-muted-foreground">
                Shown on the collection card on the home page and the collections index. Leave blank for no image.
              </p>
              {fieldErrors.image ? <p className="text-sm text-destructive">{fieldErrors.image}</p> : null}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={pending} onClick={handleSubmit}>
              {editingId ? 'Save changes' : 'Create collection'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {deleteTarget?.name}?</DialogTitle>
            <DialogDescription>
              This permanently deletes the collection. Its products are only detached from it — they are not deleted.
            </DialogDescription>
          </DialogHeader>
          {deleteError ? (
            <p role="alert" className="text-sm text-destructive">
              {deleteError}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={() => setDeleteTarget(null)}>
              Keep collection
            </Button>
            <Button type="button" variant="destructive" disabled={pending} onClick={handleDelete}>
              Confirm delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
