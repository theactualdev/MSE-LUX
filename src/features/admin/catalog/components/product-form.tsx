'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { updateProductAction } from '@/features/admin/catalog/actions'
import type { UpdateProductInput } from '@/features/admin/catalog/schema'
import type { AdminProductDetail, TaxonomyOptions } from '@/features/admin/catalog/data'
import type { ProductStatus } from '@/generated/prisma/client'

const GENERIC_ERROR = 'Something went wrong. Please try again.'
const CONFLICT_ERROR = 'Something changed — refresh and try again'

/** Paths with their own inline error slot next to the field — everything else falls back to the generic issues list. */
const INLINE_FIELD_SLOTS = new Set([
  'name',
  'slug',
  'sku',
  'priceNgnMinor',
  'priceUsdMinor',
  'salePriceNgnMinor',
  'salePriceUsdMinor',
  'categoryId',
])

// MONEY AT THE FORM BOUNDARY: every price field is displayed/edited in major
// units (e.g. "45000.00") but the schema — and everything server-side —
// speaks minor units (integer kobo/cents). This helper pair (`minorToMajor*`
// for seeding, `toMinor*` for submitting) is the ONLY place that conversion
// happens; `toInt*` is the same idiom for the non-money integer fields
// (inventory, weightGrams), which never touch `* 100`.
function minorToMajor(amountMinor: number): string {
  return (amountMinor / 100).toFixed(2)
}

// Exported: `variants-builder.tsx` (T6) reuses this pair as its own money
// boundary rather than re-deriving the `* 100` logic — see that file's
// docblock for how it seeds/reads new-variant price inputs with them.
export function minorToMajorNullable(amountMinor: number | null): string {
  return amountMinor === null ? '' : minorToMajor(amountMinor)
}

function toMinor(value: string): number {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0
}

export function toMinorNullable(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const parsed = Number.parseFloat(trimmed)
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : null
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

// Base UI's `<Select.Value>` only resolves a label DIFFERENT from the raw
// value (e.g. "Active" for "ACTIVE") via the root's `items` prop — its
// `<Select.Item>` children aren't mounted (and so never register a
// value→label mapping) until the popup has actually been opened once. Every
// Select below whose value isn't already its own display label passes
// `items` for exactly this reason; skipping it would show the raw value on
// first paint instead of the friendly label.
const STATUS_ITEMS = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'DRAFT', label: 'Draft' },
]

/** Display label for a variant row: its option values ("Small / Gold") when it has any, else its SKU. */
function variantLabel(variant: AdminProductDetail['variants'][number]): string {
  return variant.options.length > 0 ? variant.options.map((option) => option.value).join(' / ') : variant.sku
}

interface VariantRowState {
  id: string
  sku: string
  inventory: string
  priceNgn: string
  priceUsd: string
}

function initialVariantRows(product: AdminProductDetail): VariantRowState[] {
  return product.variants.map((variant) => ({
    id: variant.id,
    sku: variant.sku,
    inventory: String(variant.inventory),
    priceNgn: minorToMajorNullable(variant.priceNgnMinor),
    priceUsd: minorToMajorNullable(variant.priceUsdMinor),
  }))
}

interface ProductFormProps {
  product: AdminProductDetail
  taxonomy: TaxonomyOptions
}

/**
 * Full edit form for a single catalog product — every 8c-1-editable field
 * from `AdminProductDetail`, seeded 1:1 so an untouched submit round-trips
 * back through `updateProductSchema` without renames. Client component;
 * `useTransition` wraps the `updateProductAction` call so a pending submit
 * doesn't block the rest of the page, and a successful save always ends
 * with `router.refresh()` so the form re-seeds from the server's fresh read.
 */
export function ProductForm({ product, taxonomy }: ProductFormProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const hasVariants = product.variants.length > 0

  const [name, setName] = useState(product.name)
  const [slug, setSlug] = useState(product.slug)
  const [sku, setSku] = useState(product.sku)
  const [status, setStatus] = useState<ProductStatus>(product.status)
  const [material, setMaterial] = useState(product.material)
  const [materialTagsInput, setMaterialTagsInput] = useState(product.materialTags.join(', '))
  const [shortDescription, setShortDescription] = useState(product.shortDescription)
  const [description, setDescription] = useState(product.description)

  const [priceNgnInput, setPriceNgnInput] = useState(minorToMajor(product.priceNgnMinor))
  const [priceUsdInput, setPriceUsdInput] = useState(minorToMajor(product.priceUsdMinor))
  const [salePriceNgnInput, setSalePriceNgnInput] = useState(minorToMajorNullable(product.salePriceNgnMinor))
  const [salePriceUsdInput, setSalePriceUsdInput] = useState(minorToMajorNullable(product.salePriceUsdMinor))

  const [inventoryInput, setInventoryInput] = useState(String(product.inventory))
  const [weightInput, setWeightInput] = useState(product.weightGrams === null ? '' : String(product.weightGrams))

  const [seoTitle, setSeoTitle] = useState(product.seoTitle ?? '')
  const [seoDescription, setSeoDescription] = useState(product.seoDescription ?? '')

  const [categoryId, setCategoryId] = useState(product.categoryId)
  const [subcategoryId, setSubcategoryId] = useState(product.subcategoryId ?? '')

  const [selectedCollections, setSelectedCollections] = useState<Set<string>>(new Set(product.collectionIds))
  const [badgeNew, setBadgeNew] = useState(product.badges.includes('NEW'))
  const [badgeBestSeller, setBadgeBestSeller] = useState(product.badges.includes('BEST_SELLER'))

  const [variantRows, setVariantRows] = useState<VariantRowState[]>(() => initialVariantRows(product))

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [generalError, setGeneralError] = useState<string | undefined>(undefined)
  const [success, setSuccess] = useState(false)

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

  function updateVariantRow(id: string, patch: Partial<VariantRowState>) {
    setVariantRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)))
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSuccess(false)
    setGeneralError(undefined)

    const trimmedName = name.trim()
    const priceNgnMinor = toMinor(priceNgnInput)
    const priceUsdMinor = toMinor(priceUsdInput)
    const salePriceNgnMinor = toMinorNullable(salePriceNgnInput)
    const salePriceUsdMinor = toMinorNullable(salePriceUsdInput)

    // Client-side mirrors of the server rules most likely to be hit by
    // typos — copy IDENTICAL to schema.ts's `superRefine` messages (sale
    // price) and `product-create-form.tsx`'s own blank-price guard (regular
    // price), so the two forms never visibly disagree.
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

    if (Object.keys(nextFieldErrors).length > 0) {
      setFieldErrors(nextFieldErrors)
      return
    }
    setFieldErrors({})

    const badges: UpdateProductInput['badges'] = []
    if (badgeNew) badges.push('NEW')
    if (badgeBestSeller) badges.push('BEST_SELLER')

    const payload: UpdateProductInput = {
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
      inventory: hasVariants ? product.inventory : toInt(inventoryInput),
      weightGrams: toIntNullable(weightInput),
      status,
      seoTitle: seoTitle.trim() ? seoTitle.trim() : null,
      seoDescription: seoDescription.trim() ? seoDescription.trim() : null,
      categoryId,
      subcategoryId: subcategoryId === '' ? null : subcategoryId,
      collectionIds: taxonomy.collections.filter((collection) => selectedCollections.has(collection.id)).map((c) => c.id),
      variants: variantRows.map((row) => ({
        id: row.id,
        sku: row.sku.trim(),
        inventory: toInt(row.inventory),
        priceNgnMinor: toMinorNullable(row.priceNgn),
        priceUsdMinor: toMinorNullable(row.priceUsd),
      })),
    }

    startTransition(async () => {
      const result = await updateProductAction(product.id, payload)
      if (result.ok) {
        setSuccess(true)
        router.refresh()
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
      } else if (result.error === 'conflict') {
        // UI COPY RULE (engine review): this must never read "not found".
        setGeneralError(CONFLICT_ERROR)
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
      {success ? <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">Saved.</p> : null}
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
            <Label htmlFor="pf-name">Name</Label>
            <Input id="pf-name" value={name} onChange={(e) => setName(e.target.value)} disabled={pending} />
            {fieldErrors.name ? (
              <p role="alert" className="text-sm text-destructive">
                {fieldErrors.name}
              </p>
            ) : null}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor="pf-slug">Slug</Label>
              <Input id="pf-slug" value={slug} onChange={(e) => setSlug(e.target.value)} disabled={pending} />
              {fieldErrors.slug ? (
                <p role="alert" className="text-sm text-destructive">
                  {fieldErrors.slug}
                </p>
              ) : null}
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="pf-sku">SKU</Label>
              <Input id="pf-sku" value={sku} onChange={(e) => setSku(e.target.value)} disabled={pending} />
              {fieldErrors.sku ? (
                <p role="alert" className="text-sm text-destructive">
                  {fieldErrors.sku}
                </p>
              ) : null}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor="pf-material">Material</Label>
              <Input id="pf-material" value={material} onChange={(e) => setMaterial(e.target.value)} disabled={pending} />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="pf-status">Status</Label>
              <Select value={status} items={STATUS_ITEMS} disabled={pending} onValueChange={(value) => setStatus(value as ProductStatus)}>
                <SelectTrigger id="pf-status" className="w-full">
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
            <Label htmlFor="pf-material-tags">Material tags</Label>
            <Input
              id="pf-material-tags"
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
            <Label htmlFor="pf-short-description">Short description</Label>
            <Textarea
              id="pf-short-description"
              value={shortDescription}
              onChange={(e) => setShortDescription(e.target.value)}
              disabled={pending}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="pf-description">Description</Label>
            <Textarea id="pf-description" value={description} onChange={(e) => setDescription(e.target.value)} disabled={pending} />
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
              <Label htmlFor="pf-price-ngn">Price (NGN)</Label>
              <Input
                id="pf-price-ngn"
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
              <Label htmlFor="pf-price-usd">Price (USD)</Label>
              <Input
                id="pf-price-usd"
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
              <Label htmlFor="pf-sale-price-ngn">Sale price (NGN)</Label>
              <Input
                id="pf-sale-price-ngn"
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
              <Label htmlFor="pf-sale-price-usd">Sale price (USD)</Label>
              <Input
                id="pf-sale-price-usd"
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
        <CardContent className="flex flex-col gap-4">
          {hasVariants ? (
            <div className="flex flex-col gap-4">
              {product.variants.map((variant) => {
                const label = variantLabel(variant)
                const row = variantRows.find((r) => r.id === variant.id)
                if (!row) return null
                return (
                  <div key={variant.id} className="flex flex-col gap-3 rounded-xl border border-border p-3">
                    <p className="text-sm font-medium text-foreground">{label}</p>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="flex flex-col gap-1">
                        <Label htmlFor={`pf-variant-${variant.id}-sku`}>{`${label} SKU`}</Label>
                        <Input
                          id={`pf-variant-${variant.id}-sku`}
                          aria-label={`${label} SKU`}
                          value={row.sku}
                          onChange={(e) => updateVariantRow(variant.id, { sku: e.target.value })}
                          disabled={pending}
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <Label htmlFor={`pf-variant-${variant.id}-inventory`}>{`${label} inventory`}</Label>
                        <Input
                          id={`pf-variant-${variant.id}-inventory`}
                          aria-label={`${label} inventory`}
                          type="number"
                          value={row.inventory}
                          onChange={(e) => updateVariantRow(variant.id, { inventory: e.target.value })}
                          disabled={pending}
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <Label htmlFor={`pf-variant-${variant.id}-price-ngn`}>{`${label} price override (NGN)`}</Label>
                        <Input
                          id={`pf-variant-${variant.id}-price-ngn`}
                          aria-label={`${label} price override (NGN)`}
                          type="number"
                          step="0.01"
                          value={row.priceNgn}
                          onChange={(e) => updateVariantRow(variant.id, { priceNgn: e.target.value })}
                          disabled={pending}
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <Label htmlFor={`pf-variant-${variant.id}-price-usd`}>{`${label} price override (USD)`}</Label>
                        <Input
                          id={`pf-variant-${variant.id}-price-usd`}
                          aria-label={`${label} price override (USD)`}
                          type="number"
                          step="0.01"
                          value={row.priceUsd}
                          onChange={(e) => updateVariantRow(variant.id, { priceUsd: e.target.value })}
                          disabled={pending}
                        />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="flex flex-col gap-1 sm:max-w-xs">
              <Label htmlFor="pf-inventory">Inventory</Label>
              <Input
                id="pf-inventory"
                type="number"
                value={inventoryInput}
                onChange={(e) => setInventoryInput(e.target.value)}
                disabled={pending}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Physical</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-1 sm:max-w-xs">
            <Label htmlFor="pf-weight">Weight (g)</Label>
            <Input id="pf-weight" type="number" value={weightInput} onChange={(e) => setWeightInput(e.target.value)} disabled={pending} />
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
                id="pf-badge-new"
                checked={badgeNew}
                onChange={(e) => setBadgeNew(e.target.checked)}
                disabled={pending}
              />
              New
            </label>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                id="pf-badge-best-seller"
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
            <Label htmlFor="pf-seo-title">SEO title</Label>
            <Input id="pf-seo-title" value={seoTitle} onChange={(e) => setSeoTitle(e.target.value)} disabled={pending} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="pf-seo-description">SEO description</Label>
            <Textarea
              id="pf-seo-description"
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
              <Label htmlFor="pf-category">Category</Label>
              <Select
                value={categoryId}
                items={categoryItems}
                disabled={pending}
                onValueChange={(value) => handleCategoryChange(value as string)}
              >
                <SelectTrigger id="pf-category" className="w-full">
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
              <Label htmlFor="pf-subcategory">Subcategory</Label>
              <Select
                value={subcategoryId}
                items={subcategoryItems}
                disabled={pending || subcategoryOptions.length === 0}
                onValueChange={(value) => setSubcategoryId(value as string)}
              >
                <SelectTrigger id="pf-subcategory" className="w-full">
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

      <Button type="submit" disabled={pending} className="self-start">
        Save changes
      </Button>
    </form>
  )
}
