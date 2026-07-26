'use client'

import { useState, useTransition, type ChangeEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { uploadProductImageAction, updateProductImagesAction } from '@/features/admin/catalog/actions'

const GENERIC_ERROR = 'Something went wrong. Please try again.'
const TYPE_ERROR = 'Only JPEG, PNG, or WEBP images are allowed.'
const SIZE_ERROR = 'Image must be 5MB or smaller.'
const ALT_REQUIRED_ERROR = 'Every image needs alt text before saving (required for accessibility).'

// Mirrors the server-enforced limits in `@/features/admin/catalog/images.ts`.
// That module is `server-only` and cannot be imported from a client
// component, so the numbers are duplicated here as a client-side PRE-CHECK
// only — instant feedback before spending an upload round trip. The server
// re-validates independently on every upload and remains authoritative.
const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

export interface ImageManagerImage {
  src: string
  alt: string
}

interface ImageManagerProps {
  productId: string
  initialImages: ImageManagerImage[]
  mode: 'edit' | 'staged'
  onImagesChange?: (images: ImageManagerImage[]) => void
}

/**
 * Upload / reorder / alt-text / remove panel for a product's image set.
 * Shared between the edit page (`mode="edit"`, T7) and the create form
 * (`mode="staged"`, T8): in `edit` mode this component owns its own Save
 * button and calls `updateProductImagesAction` directly; in `staged` mode
 * there is no Save button at all — every list change (add/remove/reorder/alt
 * edit) is reported to the caller via `onImagesChange` so the create form's
 * own submit carries the images. Uploads always go straight to
 * `uploadProductImageAction` in BOTH modes — in staged mode `productId` is
 * the caller's pre-generated staging UUID, so the object already lands in
 * its final storage path even before the product row exists.
 *
 * Thumbnails render as a plain `<img>` rather than `next/image`: the src is
 * an arbitrary just-uploaded Supabase Storage URL (no known dimensions,
 * `product-images` bucket already allow-listed in `next.config.ts`), and for
 * an admin management grid the optimization pipeline buys nothing here.
 *
 * Alt text is required (non-blank) on every image before Save is allowed —
 * surfaced inline rather than silently stripped, since blank alt text on a
 * live PDP is an accessibility regression, not a cosmetic gap. At least one
 * image is always required, so Remove disables itself at the last image
 * rather than allowing an empty set.
 */
export function ImageManager({ productId, initialImages, mode, onImagesChange }: ImageManagerProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [images, setImages] = useState<ImageManagerImage[]>(initialImages)
  const [error, setError] = useState<string | undefined>(undefined)
  const [note, setNote] = useState<string | undefined>(undefined)

  function commit(next: ImageManagerImage[]) {
    setImages(next)
    if (mode === 'staged') onImagesChange?.(next)
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    setNote(undefined)

    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      setError(TYPE_ERROR)
      return
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError(SIZE_ERROR)
      return
    }

    setError(undefined)
    startTransition(async () => {
      const formData = new FormData()
      formData.set('file', file)
      const result = await uploadProductImageAction(productId, formData)
      if (!result.ok) {
        setError(uploadErrorMessage(result.error))
        return
      }
      commit([...images, { src: result.src, alt: '' }])
    })
  }

  function handleRemove(index: number) {
    if (images.length <= 1) return
    setError(undefined)
    setNote(undefined)
    commit(images.filter((_, i) => i !== index))
  }

  function handleMove(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= images.length) return
    setError(undefined)
    setNote(undefined)
    const next = [...images]
    const [moved] = next.splice(index, 1)
    next.splice(target, 0, moved)
    commit(next)
  }

  function handleAltChange(index: number, alt: string) {
    setNote(undefined)
    commit(images.map((image, i) => (i === index ? { ...image, alt } : image)))
  }

  function handleSave() {
    setNote(undefined)
    if (images.some((image) => image.alt.trim() === '')) {
      setError(ALT_REQUIRED_ERROR)
      return
    }
    setError(undefined)
    startTransition(async () => {
      const result = await updateProductImagesAction(productId, { images })
      if (!result.ok) {
        setError(GENERIC_ERROR)
        return
      }
      setNote('Images saved.')
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-4">
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {note ? <p className="text-sm text-muted-foreground">{note}</p> : null}

      <div className="flex flex-col gap-3">
        {images.map((image, index) => (
          <div key={`${image.src}-${index}`} className="flex items-center gap-3 rounded-xl border border-border p-3">
            <img
              src={image.src}
              alt={image.alt || `Product image ${index + 1}`}
              className="h-16 w-16 shrink-0 rounded-md object-cover"
            />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <Label htmlFor={`image-manager-alt-${index}`}>Alt text for image {index + 1}</Label>
              <Input
                id={`image-manager-alt-${index}`}
                value={image.alt}
                disabled={pending}
                onChange={(event) => handleAltChange(index, event.target.value)}
              />
            </div>
            <div className="flex shrink-0 gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pending || index === 0}
                onClick={() => handleMove(index, -1)}
              >
                Move up
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pending || index === images.length - 1}
                onClick={() => handleMove(index, 1)}
              >
                Move down
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={pending || images.length <= 1}
                onClick={() => handleRemove(index)}
              >
                Remove image
              </Button>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="image-manager-file">Add image</Label>
        <input
          id="image-manager-file"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={pending}
          onChange={handleFileChange}
        />
      </div>

      {mode === 'edit' ? (
        <Button type="button" className="self-start" disabled={pending} onClick={handleSave}>
          Save images
        </Button>
      ) : null}
    </div>
  )
}

function uploadErrorMessage(error: 'forbidden' | 'invalid-input' | 'invalid-type' | 'too-large' | 'storage-error'): string {
  switch (error) {
    case 'invalid-type':
      return TYPE_ERROR
    case 'too-large':
      return SIZE_ERROR
    default:
      return GENERIC_ERROR
  }
}
