'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { updateProductVariantsAction } from '@/features/admin/catalog/actions'
import {
  VariantsBuilder,
  type ExistingVariantSummary,
  type VariantsBuilderChange,
} from '@/features/admin/catalog/components/variants-builder'
import type { AdminProductDetail } from '@/features/admin/catalog/data'

const GENERIC_ERROR = 'Something went wrong. Please try again.'
const SKU_CONFLICT_ERROR = 'Fix duplicate variant SKUs before saving.'
const VARIANT_HAS_ORDERS_ERROR = "A variant you're trying to delete has existing orders and can't be removed."
const SKU_TAKEN_ERROR = 'One of these SKUs already belongs to a different product. SKUs are unique across the whole catalog.'

/** "Size: M", or "Variant 3" when a row somehow carries no options. */
function describeVariant(variant: { options: { name: string; value: string }[] }, index: number): string {
  if (variant.options.length === 0) return `Variant ${index + 1}`
  return variant.options.map((option) => `${option.name}: ${option.value}`).join(' / ')
}

/**
 * Turns the server's field-level issues into messages naming the row and the
 * field, e.g. `Size: M — SKU is required`.
 *
 * This exists because the panel used to collapse EVERY `invalid-input`
 * response into "Something went wrong. Please try again." The server was
 * already returning per-field issues saying exactly which variant was
 * incomplete; the UI computed the one useful fact and then threw it away. In
 * practice a generated variant row starts with a blank SKU and inventory, so
 * the most common save failure was also the least explicable one — the
 * client hit it, could not tell what was wrong, and concluded that saving
 * variants "doesn't work".
 */
function describeIssues(
  issues: { path: PropertyKey[]; message: string }[] | undefined,
  newVariants: { options: { name: string; value: string }[] }[],
): string | undefined {
  if (!issues || issues.length === 0) return undefined

  const messages = new Set<string>()

  for (const issue of issues) {
    const [root, index, field] = issue.path
    if (root === 'addVariants' && typeof index === 'number') {
      const variant = newVariants[index]
      const label = variant ? describeVariant(variant, index) : `Variant ${index + 1}`
      if (field === 'sku') {
        messages.add(`${label} — SKU is required.`)
      } else if (field === 'inventory') {
        messages.add(`${label} — enter a stock quantity (0 or more).`)
      } else if (field === 'priceNgnMinor' || field === 'priceUsdMinor') {
        messages.add(`${label} — price must be greater than zero, or left blank to use the product price.`)
      } else {
        messages.add(`${label} — ${issue.message}`)
      }
      continue
    }

    if (root === 'optionTypes') {
      messages.add(`Options — ${issue.message}`)
      continue
    }

    messages.add(issue.message)
  }

  return messages.size > 0 ? [...messages].join(' ') : undefined
}

const EMPTY_CHANGE: VariantsBuilderChange = { optionTypes: [], newVariants: [], deleteVariantIds: [], hasSkuConflict: false }

function toExistingVariants(product: AdminProductDetail): ExistingVariantSummary[] {
  return product.variants.map((variant) => ({
    id: variant.id,
    sku: variant.sku,
    options: variant.options,
    hasOrders: variant.hasOrders,
  }))
}

function toInitialOptionTypes(product: AdminProductDetail): { name: string; values: string[] }[] {
  return product.optionTypes.map((optionType) => ({
    name: optionType.name,
    values: optionType.values.map((value) => value.value),
  }))
}

interface VariantStructurePanelProps {
  product: AdminProductDetail
}

/**
 * Edit-page wrapper around `VariantsBuilder` (mode="edit", T6) that owns the
 * Save action for variant STRUCTURE — add new variants, delete existing ones,
 * replace the product's optionTypes — via `updateProductVariantsAction`.
 * Existing-variant SCALAR edits (sku/inventory/price) stay entirely in
 * `ProductForm`; this panel never touches them, mirroring the split already
 * documented in `structure.ts`/`products.ts`.
 *
 * Save is blocked client-side (inline message, no action call) while the
 * builder reports `hasSkuConflict` — the server's own `conflict-sku` check
 * stays authoritative regardless. `'variant-has-orders'` (a delete target
 * gained an order line between render and submit) surfaces as its own
 * `role="alert"` message rather than the generic fallback, since "something
 * went wrong" would send an admin looking for a bug that isn't one.
 *
 * `VariantsBuilder` is remounted (via `key`) on every successful save.
 * `updateProductVariants` always deletes and recreates the product's
 * optionTypes wholesale (see `structure.ts`'s docblock), so their ids are
 * guaranteed to change after a save that touches structure at all — keying
 * off them (plus the surviving/added variant ids) forces the builder to
 * re-seed from the freshly `router.refresh()`-ed `product` prop instead of
 * continuing to display now-saved "new variant" rows as still-pending.
 */
export function VariantStructurePanel({ product }: VariantStructurePanelProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [change, setChange] = useState<VariantsBuilderChange>(EMPTY_CHANGE)
  const [error, setError] = useState<string | undefined>(undefined)
  const [note, setNote] = useState<string | undefined>(undefined)

  const existingVariants = toExistingVariants(product)
  const initialOptionTypes = toInitialOptionTypes(product)
  const builderKey = [...product.optionTypes.map((optionType) => optionType.id), ...product.variants.map((variant) => variant.id)].join(
    ',',
  )

  // Clears the stale "Variants saved." note as soon as the builder reports a
  // new edit — same clear-on-edit idiom as `ImageManager`'s own handlers —
  // so it doesn't linger and imply an in-progress, unsaved edit was already
  // persisted.
  function handleBuilderChange(next: VariantsBuilderChange) {
    setNote(undefined)
    setChange(next)
  }

  function handleSave() {
    setNote(undefined)
    if (change.hasSkuConflict) {
      setError(SKU_CONFLICT_ERROR)
      return
    }

    // Caught here rather than at the server: "Generate variants" creates rows
    // with a blank SKU, so this is the single most likely reason a save fails,
    // and naming the rows immediately beats a round trip that comes back
    // saying the same thing.
    const missingSku = change.newVariants
      .map((variant, index) => ({ variant, index }))
      .filter(({ variant }) => variant.sku.trim() === '')
    if (missingSku.length > 0) {
      setError(
        `Every variant needs its own SKU before it can be saved. Missing on: ${missingSku
          .map(({ variant, index }) => describeVariant(variant, index))
          .join(', ')}.`,
      )
      return
    }

    setError(undefined)
    startTransition(async () => {
      const result = await updateProductVariantsAction(product.id, {
        addVariants: change.newVariants,
        deleteVariantIds: change.deleteVariantIds,
        optionTypes: change.optionTypes,
      })

      if (!result.ok) {
        if (result.error === 'variant-has-orders') {
          setError(VARIANT_HAS_ORDERS_ERROR)
        } else if (result.error === 'conflict-sku') {
          setError(SKU_TAKEN_ERROR)
        } else {
          // `issues` is absent on the 'forbidden' arm of the action's union
          // (that path never reaches the engine), so it has to be narrowed
          // rather than read directly.
          const issues = 'issues' in result ? result.issues : undefined
          setError(describeIssues(issues, change.newVariants) ?? GENERIC_ERROR)
        }
        return
      }

      // A variant with no stock is unbuyable, and blank inventory saves as 0
      // without complaint — so a "saved" product can still refuse every
      // option on the storefront, with nothing having gone visibly wrong.
      // That is the same dead end as saving no variants at all, reached a
      // different way, so say it here rather than let it be rediscovered on
      // the product page.
      const saved = change.newVariants
      const allOutOfStock = saved.length > 0 && saved.every((variant) => variant.inventory === 0)

      setChange(EMPTY_CHANGE)
      setNote(
        allOutOfStock
          ? 'Variants saved — but every one has 0 stock, so customers still cannot add this to their bag. Set a quantity on each variant.'
          : 'Variants saved.',
      )
      router.refresh()
    })
  }

  // Options without variants is a silent dead end: the product page renders
  // every option struck through and refuses "Add to bag", while the admin
  // looks saved and complete. Saying so here is the difference between a
  // five-second fix and concluding the variants feature is broken.
  const unbuyable = product.optionTypes.length > 0 && product.variants.length === 0

  return (
    <div className="flex flex-col gap-4">
      {unbuyable ? (
        <p role="status" className="rounded-md border border-border bg-muted p-3 text-sm text-foreground">
          This product has options but no variants, so customers cannot buy it — every size or colour shows as
          unavailable. Choose <strong>Generate variants</strong>, give each row its own SKU and a stock quantity, then
          save.
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {note ? (
        <p role="status" className="text-sm text-muted-foreground">
          {note}
        </p>
      ) : null}

      <VariantsBuilder
        key={builderKey}
        mode="edit"
        initialOptionTypes={initialOptionTypes}
        existingVariants={existingVariants}
        onChange={handleBuilderChange}
      />

      <Button type="button" className="self-start" disabled={pending} onClick={handleSave}>
        Save variants
      </Button>
    </div>
  )
}
