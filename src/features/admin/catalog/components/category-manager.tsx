'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  createCategoryAction,
  updateCategoryAction,
  deleteCategoryAction,
  createSubcategoryAction,
  updateSubcategoryAction,
  deleteSubcategoryAction,
} from '@/features/admin/catalog/actions'
import type { AdminCategoryListItem, AdminSubcategoryListItem } from '@/features/admin/catalog/data'

const GENERIC_ERROR = 'Something went wrong. Please try again.'

interface CategoryManagerProps {
  categories: AdminCategoryListItem[]
}

interface FormFieldErrors {
  name?: string
  slug?: string
  description?: string
  image?: string
}

/** What the open form is editing: a category, or a subcategory of a known parent. */
type FormTarget =
  | { kind: 'category'; id: string | null }
  | { kind: 'subcategory'; id: string | null; categoryId: string; categoryName: string }

/** What a pending delete would remove, plus whether it is allowed to. */
type DeleteTarget =
  | { kind: 'category'; item: AdminCategoryListItem }
  | { kind: 'subcategory'; item: AdminSubcategoryListItem; categoryName: string }

/**
 * The `/admin/catalog/categories` manager — the storefront taxonomy.
 *
 * Categories had no admin at all before this: they lived in a code fixture and
 * changing them meant editing source, re-seeding and deploying. Since
 * navigation is now built from the database, a category created here reaches
 * the header, mega menu, mobile drawer and footer as well as its own listing
 * page.
 *
 * DELETES ARE GUARDED BY COUNTS, not by hope. A category holding products
 * cannot be deleted at all — `Product.categoryId` is required, so Postgres
 * would reject it — and a subcategory holding products must not be, because
 * that FK is nullable and deleting would silently unfile every product under
 * it. Both buttons are disabled with the reason shown inline, so the admin is
 * never offered an action that is going to fail.
 *
 * Mirrors `CollectionManager`: `useTransition` around every action, a
 * successful call ends in `router.refresh()`, and errors render `role="alert"`
 * INSIDE the open dialog — base-ui marks the rest of the tree `aria-hidden`
 * while a dialog is open, so a banner outside it would be invisible to
 * assistive tech exactly when it matters.
 */
export function CategoryManager({ categories }: CategoryManagerProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const [formOpen, setFormOpen] = useState(false)
  const [target, setTarget] = useState<FormTarget>({ kind: 'category', id: null })
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [description, setDescription] = useState('')
  const [image, setImage] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FormFieldErrors>({})
  const [formError, setFormError] = useState<string | undefined>(undefined)

  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null)
  const [deleteError, setDeleteError] = useState<string | undefined>(undefined)

  function resetForm() {
    setName('')
    setSlug('')
    setDescription('')
    setImage('')
    setFieldErrors({})
    setFormError(undefined)
  }

  function openCreateCategory() {
    resetForm()
    setTarget({ kind: 'category', id: null })
    setFormOpen(true)
  }

  function openEditCategory(category: AdminCategoryListItem) {
    resetForm()
    setTarget({ kind: 'category', id: category.id })
    setName(category.name)
    setSlug(category.slug)
    setDescription(category.description ?? '')
    setImage(category.image ?? '')
    setFormOpen(true)
  }

  function openCreateSubcategory(category: AdminCategoryListItem) {
    resetForm()
    setTarget({ kind: 'subcategory', id: null, categoryId: category.id, categoryName: category.name })
    setFormOpen(true)
  }

  function openEditSubcategory(category: AdminCategoryListItem, sub: AdminSubcategoryListItem) {
    resetForm()
    setTarget({ kind: 'subcategory', id: sub.id, categoryId: category.id, categoryName: category.name })
    setName(sub.name)
    setSlug(sub.slug)
    setFormOpen(true)
  }

  function handleSubmit() {
    setFieldErrors({})
    setFormError(undefined)

    const trimmedDescription = description.trim()
    const trimmedImage = image.trim()

    startTransition(async () => {
      const result =
        target.kind === 'category'
          ? await (async () => {
              const payload = {
                name: name.trim(),
                slug: slug.trim(),
                description: trimmedDescription ? trimmedDescription : null,
                image: trimmedImage ? trimmedImage : null,
              }
              return target.id ? updateCategoryAction(target.id, payload) : createCategoryAction(payload)
            })()
          : await (async () => {
              const payload = { categoryId: target.categoryId, name: name.trim(), slug: slug.trim() }
              return target.id ? updateSubcategoryAction(target.id, payload) : createSubcategoryAction(payload)
            })()

      if (result.ok) {
        setFormOpen(false)
        router.refresh()
        return
      }

      if (result.error === 'conflict-slug') {
        setFieldErrors({
          slug:
            target.kind === 'category'
              ? 'This slug is already in use by another category.'
              : 'This slug is already used by another subcategory in this category.',
        })
        return
      }

      if (result.error === 'invalid-input' && result.issues && result.issues.length > 0) {
        const issueMap: FormFieldErrors = {}
        for (const issue of result.issues) {
          const path = issue.path.map(String).join('.')
          if (path === 'name' || path === 'slug' || path === 'description' || path === 'image') {
            issueMap[path] = issue.message
          }
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
      const result =
        deleteTarget.kind === 'category'
          ? await deleteCategoryAction(deleteTarget.item.id)
          : await deleteSubcategoryAction(deleteTarget.item.id)

      if (result.ok) {
        setDeleteTarget(null)
        router.refresh()
        return
      }

      // The counts already disable the button for this case, but the check is
      // re-run server-side and can legitimately win a race — someone filing a
      // product into this category while the dialog sat open.
      setDeleteError(
        result.error === 'has-products'
          ? 'This now has products filed under it. Move them first, then try again.'
          : GENERIC_ERROR,
      )
    })
  }

  const isSubcategoryForm = target.kind === 'subcategory'

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-end">
        <Button type="button" onClick={openCreateCategory}>
          New category
        </Button>
      </div>

      {categories.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
          No categories yet.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {categories.map((category) => (
            <div key={category.id} className="flex flex-col rounded-xl border border-border">
              <div className="flex items-center justify-between gap-4 p-4">
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="truncate font-display text-sm font-medium text-foreground">{category.name}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    /{category.slug} &middot; {category.productCount}{' '}
                    {category.productCount === 1 ? 'product' : 'products'}
                  </span>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => openCreateSubcategory(category)}>
                    Add subcategory
                  </Button>
                  <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => openEditCategory(category)}>
                    Edit
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    disabled={pending || category.productCount > 0}
                    title={
                      category.productCount > 0
                        ? 'Move its products to another category before deleting it.'
                        : undefined
                    }
                    onClick={() => {
                      setDeleteError(undefined)
                      setDeleteTarget({ kind: 'category', item: category })
                    }}
                  >
                    Delete
                  </Button>
                </div>
              </div>

              <div className="flex flex-col divide-y divide-border border-t border-border">
                {category.subcategories.length === 0 ? (
                  <p className="px-4 py-3 text-xs text-muted-foreground">No subcategories.</p>
                ) : (
                  category.subcategories.map((sub) => (
                    <div key={sub.id} className="flex items-center justify-between gap-4 px-4 py-3">
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate text-sm text-foreground">{sub.name}</span>
                        <span className="truncate text-xs text-muted-foreground">
                          /{category.slug}/{sub.slug} &middot; {sub.productCount}{' '}
                          {sub.productCount === 1 ? 'product' : 'products'}
                        </span>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => openEditSubcategory(category, sub)}>
                          Edit
                        </Button>
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          disabled={pending || sub.productCount > 0}
                          title={
                            sub.productCount > 0
                              ? 'Move its products elsewhere before deleting it.'
                              : undefined
                          }
                          onClick={() => {
                            setDeleteError(undefined)
                            setDeleteTarget({ kind: 'subcategory', item: sub, categoryName: category.name })
                          }}
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {isSubcategoryForm
                ? target.id
                  ? 'Edit subcategory'
                  : `New subcategory in ${target.categoryName}`
                : target.id
                  ? 'Edit category'
                  : 'New category'}
            </DialogTitle>
            <DialogDescription>
              The slug is the URL segment — {isSubcategoryForm ? '/category/subcategory' : '/category'}. Changing it
              changes the public address of that page.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="taxonomy-name">Name</Label>
              <Input id="taxonomy-name" value={name} onChange={(event) => setName(event.target.value)} aria-invalid={!!fieldErrors.name} />
              {fieldErrors.name ? <p className="text-sm text-destructive">{fieldErrors.name}</p> : null}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="taxonomy-slug">Slug</Label>
              <Input id="taxonomy-slug" value={slug} onChange={(event) => setSlug(event.target.value)} aria-invalid={!!fieldErrors.slug} />
              {fieldErrors.slug ? <p className="text-sm text-destructive">{fieldErrors.slug}</p> : null}
            </div>

            {!isSubcategoryForm ? (
              <>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="taxonomy-description">Description</Label>
                  <Textarea
                    id="taxonomy-description"
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    aria-invalid={!!fieldErrors.description}
                  />
                  {fieldErrors.description ? <p className="text-sm text-destructive">{fieldErrors.description}</p> : null}
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="taxonomy-image">Image URL</Label>
                  <Input
                    id="taxonomy-image"
                    value={image}
                    onChange={(event) => setImage(event.target.value)}
                    aria-invalid={!!fieldErrors.image}
                  />
                  {fieldErrors.image ? <p className="text-sm text-destructive">{fieldErrors.image}</p> : null}
                </div>
              </>
            ) : null}

            {formError ? (
              <p role="alert" className="text-sm text-destructive">
                {formError}
              </p>
            ) : null}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={pending} onClick={handleSubmit}>
              {target.id ? 'Save' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {deleteTarget?.kind === 'subcategory' ? 'subcategory' : 'category'}?</DialogTitle>
            <DialogDescription>
              {deleteTarget?.kind === 'category'
                ? `"${deleteTarget.item.name}" and its subcategories will be removed, and it will disappear from the storefront navigation. This cannot be undone.`
                : deleteTarget
                  ? `"${deleteTarget.item.name}" will be removed from ${deleteTarget.categoryName} and from the storefront navigation. This cannot be undone.`
                  : null}
            </DialogDescription>
          </DialogHeader>

          {deleteError ? (
            <p role="alert" className="text-sm text-destructive">
              {deleteError}
            </p>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" disabled={pending} onClick={handleDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
