'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { createProductAction } from '@/features/admin/catalog/actions'
import { toMinorNullable } from '@/features/admin/catalog/components/product-form'
import { VariantsBuilder, type VariantsBuilderChange } from '@/features/admin/catalog/components/variants-builder'
import { ImageManager, type ImageManagerImage } from '@/features/admin/catalog/components/image-manager'
import type { CreateProductInput } from '@/features/admin/catalog/schema'
import type { TaxonomyOptions } from '@/features/admin/catalog/data'
import type { ProductStatus } from '@/generated/prisma/client'

const GENERIC_ERROR = 'Something went wrong. Please try again.'

/**
 * Paths with their own inline error slot next to the field/section —
 * everything else falls back to the generic issues list. Same idiom as
 * `product-form.tsx`'s `INLINE_FIELD_SLOTS`, extended with `priceNgnMinor`/
 * `priceUsdMinor` (blockable here, since a from-scratch product has no
 * seeded price to fall back on) and `images`/`variants`, which aren't
 * `createProductSchema` scalar paths but this form's own section-level
 * slots for the image-set and builder-state pre-submit checks below.
 */
const INLINE_FIELD_SLOTS = new Set([
  'name',
  'slug',
  'sku',
  'priceNgnMinor',
  'priceUsdMinor',
  'salePriceNgnMinor',
  'salePriceUsdMinor',
  'categoryId',
  'images',
  'variants',
])

// Private copies of `product-form.tsx`'s money/int boundary helpers — that
// file only exports the NULLABLE pair (`minorToMajorNullable`,
// `toMinorNullable`), reused below for the sale-price fields. The
// non-nullable `toMinor` (regular price) and the plain-int helpers
// (inventory, weight) stay local, same self-contained-duplication idiom as
// `variants-builder.tsx`'s own `toInt`.
function toMinor(value: string): number {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0
}

function toInt(value: string): number {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? Math.round(parsed) : 0
}

function toIntNullable(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const parsed = Number.parseFloat(trimmed)
  return Number.isFinite(parsed) ? Math.round(parsed) : null
}

// Same `items` requirement as `product-form.tsx` — see that file's docblock
// on `STATUS_ITEMS` for why Base UI's `<Select.Value>` needs it whenever a
// value's display label differs from the value itself.
const STATUS_ITEMS = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'DRAFT', label: 'Draft' },
]

const EMPTY_BUILDER_CHANGE: VariantsBuilderChange = {
  optionTypes: [],
  newVariants: [],
  deleteVariantIds: [],
  hasSkuConflict: false,
}

interface ProductCreateFormProps {
  taxonomy: TaxonomyOptions
}

/**
 * `/admin/catalog/new`'s create form — every `createProductSchema` field,
 * starting blank (status defaults to DRAFT: "publish is an explicit act"),
 * composing `VariantsBuilder` (`mode="create"`) and `ImageManager`
 * (`mode="staged"`) rather than reimplementing either.
 *
 * NOT a structural fork-and-diverge of `product-form.tsx`: this form has no
 * existing product to seed from, no per-variant rows of its own (that's
 * entirely `VariantsBuilder`'s job in create mode), and needs its OWN
 * pre-submit checks (regular price required, at least one image, every
 * image alt filled, no `hasSkuConflict`) that the edit form doesn't need —
 * extracting shared JSX sections would mean threading value/onChange/
 * disabled/error props for every field through a new component boundary,
 * which risks destabilizing `product-form.tsx`'s already-green tests for a
 * cosmetic de-dup. So this is a PARALLEL component using the same idioms
 * (Card-per-section layout, `useTransition`, inline `role="alert"` slots,
 * the money-boundary helper pair) rather than a shared one — the only
 * genuinely mechanical reuse is `product-form.tsx`'s exported
 * `toMinorNullable` (imported above), same as `variants-builder.tsx`
 * already does.
 *
 * STAGED UPLOADS: `ImageManager` needs a `productId` before the `Product`
 * row exists, so this form generates a client-side `crypto.randomUUID()`
 * ONCE per mount (`useState(() => ...)`, never regenerated on re-render)
 * and passes it as the staging id — every upload during this session lands
 * under that id's folder in the images engine's storage bucket. If the
 * form is abandoned (navigated away from, tab closed) before a successful
 * submit, those uploaded objects are never referenced by any `Product` row
 * and become orphaned under the staging folder. Known trade-off, not fixed
 * here — accepted for 8c-2 and logged as a cleanup item (a scheduled sweep
 * of staging-folder objects older than N hours with no owning product).
 */
export function ProductCreateForm({ taxonomy }: ProductCreateFormProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const [stagingId] = useState(() => crypto.randomUUID())

  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [sku, setSku] = useState('')
  const [status, setStatus] = useState<ProductStatus>('DRAFT')
  const [material, setMaterial] = useState('')
  const [materialTagsInput, setMaterialTagsInput] = useState('')
  const [shortDescription, setShortDescription] = useState('')
  const [description, setDescription] = useState('')

  const [priceNgnInput, setPriceNgnInput] = useState('')
  const [priceUsdInput, setPriceUsdInput] = useState('')
  const [salePriceNgnInput, setSalePriceNgnInput] = useState('')
  const [salePriceUsdInput, setSalePriceUsdInput] = useState('')

  const [inventoryInput, setInventoryInput] = useState('')
  const [weightInput, setWeightInput] = useState('')

  const [seoTitle, setSeoTitle] = useState('')
  const [seoDescription, setSeoDescription] = useState('')

  const [categoryId, setCategoryId] = useState(taxonomy.categories[0]?.id ?? '')
  const [subcategoryId, setSubcategoryId] = useState('')

  const [selectedCollections, setSelectedCollections] = useState<Set<string>>(new Set())
  const [badgeNew, setBadgeNew] = useState(false)
  const [badgeBestSeller, setBadgeBestSeller] = useState(false)

  const [builderState, setBuilderState] = useState<VariantsBuilderChange>(EMPTY_BUILDER_CHANGE)
  const [images, setImages] = useState<ImageManagerImage[]>([])

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [generalError, setGeneralError] = useState<string | undefined>(undefined)

  const overflowFieldErrors = Object.entries(fieldErrors).filter(([path]) => !INLINE_FIELD_SLOTS.has(path))

  const selectedCategory = taxonomy.categories.find((category) => category.id === categoryId)
  const subcategoryOptions = selectedCategory?.subcategories ?? []
  const categoryItems = taxonomy.categories.map((category) => ({ value: category.id, label: category.name }))
  const subcategoryItems = [{ value: '', label: 'None' }, ...subcategoryOptions.map((sub) => ({ value: sub.id, label: sub.name }))]

  function handleCategoryChange(nextCategoryId: string) {
    setCategoryId(nextCategoryId)
    // Reset — a subcategory belongs to exactly one category, so a stale id
    // from the previous category could otherwise be submitted alongside a
    // category it doesn't belong to.
    setSubcategoryId('')
  }

  function toggleCollection(id: string) {
    setSelectedCollections((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setGeneralError(undefined)

    const trimmedName = name.trim()
    const priceNgnMinor = toMinor(priceNgnInput)
    const priceUsdMinor = toMinor(priceUsdInput)
    const salePriceNgnMinor = toMinorNullable(salePriceNgnInput)
    const salePriceUsdMinor = toMinorNullable(salePriceUsdInput)

    // Client-side pre-submit checks — mirrors of the schema/engine rules
    // most likely to be hit by an incomplete form, so the user never pays
    // a round trip for them. The server (`createProductSchema`,
    // `createProduct`'s conflict checks) stays authoritative regardless.
    const nextFieldErrors: Record<string, string> = {}
    if (!trimmedName) nextFieldErrors.name = 'Name is required.'
    if (priceNgnMinor <= 0) nextFieldErrors.priceNgnMinor = 'A valid NGN price is required.'
    if (priceUsdMinor <= 0) nextFieldErrors.priceUsdMinor = 'A valid USD price is required.'
    if (salePriceNgnMinor !== null && salePriceNgnMinor >= priceNgnMinor) {
      nextFieldErrors.salePriceNgnMinor = 'Sale price must be below the regular NGN price'
    }
    if (salePriceUsdMinor !== null && salePriceUsdMinor >= priceUsdMinor) {
      nextFieldErrors.salePriceUsdMinor = 'Sale price must be below the regular USD price'
    }
    if (images.length === 0) {
      nextFieldErrors.images = 'At least one image is required.'
    } else if (images.some((image) => image.alt.trim() === '')) {
      nextFieldErrors.images = 'Every image needs alt text before saving (required for accessibility).'
    }
    if (builderState.hasSkuConflict) {
      nextFieldErrors.variants = 'Fix duplicate variant SKUs before saving.'
    }

    if (Object.keys(nextFieldErrors).length > 0) {
      setFieldErrors(nextFieldErrors)
      return
    }
    setFieldErrors({})

    const badges: CreateProductInput['badges'] = []
    if (badgeNew) badges.push('NEW')
    if (badgeBestSeller) badges.push('BEST_SELLER')

    const payload: CreateProductInput = {
      name: trimmedName,
      slug: slug.trim(),
      sku: sku.trim(),
      shortDescription: shortDescription.trim(),
      description: description.trim(),
      material: material.trim(),
      materialTags: materialTagsInput
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
      badges,
      priceNgnMinor,
      priceUsdMinor,
      salePriceNgnMinor,
      salePriceUsdMinor,
      inventory: toInt(inventoryInput),
      weightGrams: toIntNullable(weightInput),
      status,
      seoTitle: seoTitle.trim() ? seoTitle.trim() : null,
      seoDescription: seoDescription.trim() ? seoDescription.trim() : null,
      categoryId,
      subcategoryId: subcategoryId === '' ? null : subcategoryId,
      collectionIds: taxonomy.collections.filter((collection) => selectedCollections.has(collection.id)).map((c) => c.id),
      optionTypes: builderState.optionTypes,
      newVariants: builderState.newVariants,
      images,
    }

    startTransition(async () => {
      const result = await createProductAction(payload)
      if (result.ok && result.productId) {
        router.push(`/admin/catalog/${result.productId}`)
        return
      }
      if (result.ok) {
        // Never expected in practice — `createProduct` always sets
        // `productId` alongside `ok: true` — but the return type keeps it
        // optional, so this stays a typed fallback rather than a `!`.
        setGeneralError(GENERIC_ERROR)
        return
      }

      if (result.error === 'conflict-slug') {
        setFieldErrors({ slug: 'This slug is already in use by another product.' })
      } else if (result.error === 'conflict-sku') {
        setFieldErrors({ sku: 'This SKU is already in use by another product.' })
      } else if (result.error === 'invalid-input' && result.issues && result.issues.length > 0) {
        const issueMap: Record<string, string> = {}
        for (const issue of result.issues) issueMap[issue.path.map(String).join('.')] = issue.message
        setFieldErrors(issueMap)
      } else if (result.error === 'invalid-taxonomy') {
        setFieldErrors({ categoryId: 'Select a valid category and subcategory.' })
      } else {
        setGeneralError(GENERIC_ERROR)
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      {generalError ? (
        <p role="alert" className="text-sm text-destructive">
          {generalError}
        </p>
      ) : null}
      {overflowFieldErrors.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {overflowFieldErrors.map(([path, message]) => (
            <li key={path} role="alert" className="text-sm text-destructive">
              {path}: {message}
            </li>
          ))}
        </ul>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Basic info</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <Label htmlFor="pcf-name">Name</Label>
            <Input id="pcf-name" value={name} onChange={(e) => setName(e.target.value)} disabled={pending} />
            {fieldErrors.name ? (
              <p role="alert" className="text-sm text-destructive">
                {fieldErrors.name}
              </p>
            ) : null}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor="pcf-slug">Slug</Label>
              <Input id="pcf-slug" value={slug} onChange={(e) => setSlug(e.target.value)} disabled={pending} />
              {fieldErrors.slug ? (
                <p role="alert" className="text-sm text-destructive">
                  {fieldErrors.slug}
                </p>
              ) : null}
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="pcf-sku">SKU</Label>
              <Input id="pcf-sku" value={sku} onChange={(e) => setSku(e.target.value)} disabled={pending} />
              {fieldErrors.sku ? (
                <p role="alert" className="text-sm text-destructive">
                  {fieldErrors.sku}
                </p>
              ) : null}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor="pcf-material">Material</Label>
              <Input id="pcf-material" value={material} onChange={(e) => setMaterial(e.target.value)} disabled={pending} />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="pcf-status">Status</Label>
              <Select value={status} items={STATUS_ITEMS} disabled={pending} onValueChange={(value) => setStatus(value as ProductStatus)}>
                <SelectTrigger id="pcf-status" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="ACTIVE">Active</SelectItem>
                    <SelectItem value="DRAFT">Draft</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor="pcf-material-tags">Material tags</Label>
            <Input
              id="pcf-material-tags"
              value={materialTagsInput}
              onChange={(e) => setMaterialTagsInput(e.target.value)}
              disabled={pending}
              placeholder="gold, diamond, sterling silver"
            />
            <p className="text-xs text-muted-foreground">Comma-separated.</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Description</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <Label htmlFor="pcf-short-description">Short description</Label>
            <Textarea
              id="pcf-short-description"
              value={shortDescription}
              onChange={(e) => setShortDescription(e.target.value)}
              disabled={pending}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="pcf-description">Description</Label>
            <Textarea id="pcf-description" value={description} onChange={(e) => setDescription(e.target.value)} disabled={pending} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pricing</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor="pcf-price-ngn">Price (NGN)</Label>
              <Input
                id="pcf-price-ngn"
                type="number"
                step="0.01"
                value={priceNgnInput}
                onChange={(e) => setPriceNgnInput(e.target.value)}
                disabled={pending}
              />
              {fieldErrors.priceNgnMinor ? (
                <p role="alert" className="text-sm text-destructive">
                  {fieldErrors.priceNgnMinor}
                </p>
              ) : null}
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="pcf-price-usd">Price (USD)</Label>
              <Input
                id="pcf-price-usd"
                type="number"
                step="0.01"
                value={priceUsdInput}
                onChange={(e) => setPriceUsdInput(e.target.value)}
                disabled={pending}
              />
              {fieldErrors.priceUsdMinor ? (
                <p role="alert" className="text-sm text-destructive">
                  {fieldErrors.priceUsdMinor}
                </p>
              ) : null}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor="pcf-sale-price-ngn">Sale price (NGN)</Label>
              <Input
                id="pcf-sale-price-ngn"
                type="number"
                step="0.01"
                value={salePriceNgnInput}
                onChange={(e) => setSalePriceNgnInput(e.target.value)}
                disabled={pending}
              />
              {fieldErrors.salePriceNgnMinor ? (
                <p role="alert" className="text-sm text-destructive">
                  {fieldErrors.salePriceNgnMinor}
                </p>
              ) : null}
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="pcf-sale-price-usd">Sale price (USD)</Label>
              <Input
                id="pcf-sale-price-usd"
                type="number"
                step="0.01"
                value={salePriceUsdInput}
                onChange={(e) => setSalePriceUsdInput(e.target.value)}
                disabled={pending}
              />
              {fieldErrors.salePriceUsdMinor ? (
                <p role="alert" className="text-sm text-destructive">
                  {fieldErrors.salePriceUsdMinor}
                </p>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Inventory</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-1 sm:max-w-xs">
            <Label htmlFor="pcf-inventory">Inventory</Label>
            <Input
              id="pcf-inventory"
              type="number"
              value={inventoryInput}
              onChange={(e) => setInventoryInput(e.target.value)}
              disabled={pending}
            />
            <p className="text-xs text-muted-foreground">Ignored once variants are added below — each variant tracks its own.</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Physical</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-1 sm:max-w-xs">
            <Label htmlFor="pcf-weight">Weight (g)</Label>
            <Input id="pcf-weight" type="number" value={weightInput} onChange={(e) => setWeightInput(e.target.value)} disabled={pending} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Badges</CardTitle>
        </CardHeader>
        <CardContent>
          <fieldset className="flex flex-col gap-2">
            <legend className="sr-only">Badges</legend>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                id="pcf-badge-new"
                checked={badgeNew}
                onChange={(e) => setBadgeNew(e.target.checked)}
                disabled={pending}
              />
              New
            </label>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                id="pcf-badge-best-seller"
                checked={badgeBestSeller}
                onChange={(e) => setBadgeBestSeller(e.target.checked)}
                disabled={pending}
              />
              Best seller
            </label>
          </fieldset>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>SEO</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <Label htmlFor="pcf-seo-title">SEO title</Label>
            <Input id="pcf-seo-title" value={seoTitle} onChange={(e) => setSeoTitle(e.target.value)} disabled={pending} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="pcf-seo-description">SEO description</Label>
            <Textarea
              id="pcf-seo-description"
              value={seoDescription}
              onChange={(e) => setSeoDescription(e.target.value)}
              disabled={pending}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Taxonomy</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor="pcf-category">Category</Label>
              <Select
                value={categoryId}
                items={categoryItems}
                disabled={pending}
                onValueChange={(value) => handleCategoryChange(value as string)}
              >
                <SelectTrigger id="pcf-category" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {taxonomy.categories.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              {fieldErrors.categoryId ? (
                <p role="alert" className="text-sm text-destructive">
                  {fieldErrors.categoryId}
                </p>
              ) : null}
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="pcf-subcategory">Subcategory</Label>
              <Select
                value={subcategoryId}
                items={subcategoryItems}
                disabled={pending || subcategoryOptions.length === 0}
                onValueChange={(value) => setSubcategoryId(value as string)}
              >
                <SelectTrigger id="pcf-subcategory" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="">None</SelectItem>
                    {subcategoryOptions.map((subcategory) => (
                      <SelectItem key={subcategory.id} value={subcategory.id}>
                        {subcategory.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium text-foreground">Collections</legend>
            {taxonomy.collections.map((collection) => (
              <label key={collection.id} className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={selectedCollections.has(collection.id)}
                  onChange={() => toggleCollection(collection.id)}
                  disabled={pending}
                />
                {collection.name}
              </label>
            ))}
          </fieldset>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3">
        <h2 className="text-base font-medium text-foreground">Variants</h2>
        {fieldErrors.variants ? (
          <p role="alert" className="text-sm text-destructive">
            {fieldErrors.variants}
          </p>
        ) : null}
        <VariantsBuilder mode="create" initialOptionTypes={[]} existingVariants={[]} onChange={setBuilderState} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Images</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {fieldErrors.images ? (
            <p role="alert" className="text-sm text-destructive">
              {fieldErrors.images}
            </p>
          ) : null}
          <ImageManager mode="staged" productId={stagingId} initialImages={[]} onImagesChange={setImages} />
        </CardContent>
      </Card>

      <Button type="submit" disabled={pending} className="self-start">
        Create product
      </Button>
    </form>
  )
}
