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

  function handleSave() {
    setNote(undefined)
    if (change.hasSkuConflict) {
      setError(SKU_CONFLICT_ERROR)
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
        setError(result.error === 'variant-has-orders' ? VARIANT_HAS_ORDERS_ERROR : GENERIC_ERROR)
        return
      }
      setChange(EMPTY_CHANGE)
      setNote('Variants saved.')
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

      <VariantsBuilder
        key={builderKey}
        mode="edit"
        initialOptionTypes={initialOptionTypes}
        existingVariants={existingVariants}
        onChange={setChange}
      />

      <Button type="button" className="self-start" disabled={pending} onClick={handleSave}>
        Save variants
      </Button>
    </div>
  )
}
