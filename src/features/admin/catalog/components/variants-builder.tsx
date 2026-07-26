'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { minorToMajorNullable, toMinorNullable } from '@/features/admin/catalog/components/product-form'

const MAX_OPTION_TYPES = 3
const MAX_OPTION_VALUES = 20

/** Same non-money integer idiom as `product-form.tsx`'s `toInt` — kept as a
 * private local copy rather than exported/shared, since inventory isn't a
 * money-boundary concern (no `* 100`); each file stays self-contained the
 * same way `create.ts`/`structure.ts` duplicate `collectionSlugsFor`. */
function toInt(value: string): number {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? Math.round(parsed) : 0
}

function parseValuesInput(input: string): string[] {
  return input
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, MAX_OPTION_VALUES)
}

/** Order-independent identity for a variant's option set — used to detect
 * "this combo already exists" against both `existingVariants` and rows
 * already generated in this session. */
function optionsKey(options: { name: string; value: string }[]): string {
  return options
    .map((option) => `${option.name}=${option.value}`)
    .sort()
    .join('|')
}

function suggestedSku(options: { name: string; value: string }[]): string {
  return options.map((option) => option.value.trim().toUpperCase().replace(/\s+/g, '-')).join('-')
}

/** Keys a set of SKUs (existing-variant SKUs + in-progress new-row SKUs,
 * case-insensitive, blanks ignored) that appear more than once across the
 * combined set — used both for the top-level `hasSkuConflict` flag and to
 * highlight the specific offending row(s), regardless of whether the
 * collision is against another new row or an already-saved variant. */
function duplicateSkuKeysFor(newSkus: string[], existingSkus: string[]): Set<string> {
  const counts = new Map<string, number>()
  for (const sku of [...existingSkus, ...newSkus]) {
    const key = sku.trim().toLowerCase()
    if (!key) continue
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const duplicates = new Set<string>()
  for (const [key, count] of counts) if (count > 1) duplicates.add(key)
  return duplicates
}

/** After an option-type is renamed, has a value removed, or is deleted
 * outright, any already-generated `newVariantRows` referencing a name/value
 * combo that no longer exists in `optionTypeRows` are desynced — submitting
 * them would fail `createProductSchema`'s superRefine ("not listed in
 * optionTypes") with a confusing server-side rejection. Purged here instead:
 * a row survives only if EVERY one of its options still names a current
 * option type and one of its current values (same membership rule the
 * schema enforces). The user just regenerates — there's no way to "repair"
 * a stale row's options automatically without guessing intent. */
function purgeDesyncedRows(newVariantRows: NewVariantRowState[], optionTypeRows: OptionTypeRowState[]): NewVariantRowState[] {
  const valuesByName = new Map<string, Set<string>>()
  for (const row of optionTypeRows) {
    const name = row.name.trim()
    if (!name) continue
    valuesByName.set(name, new Set(parseValuesInput(row.valuesInput)))
  }
  return newVariantRows.filter((row) => row.options.every((option) => valuesByName.get(option.name)?.has(option.value)))
}

/** Cartesian product of every option type's values, one `{name, value}` per
 * type per combo, in `types` order. Types with zero values contribute
 * nothing (multiplying the accumulator by an empty array collapses it to
 * `[]`), so a not-yet-filled-in option type simply yields no combos rather
 * than a combo missing that option. */
function cartesianProduct(types: { name: string; values: string[] }[]): { name: string; value: string }[][] {
  return types.reduce<{ name: string; value: string }[][]>(
    (combos, type) => combos.flatMap((combo) => type.values.map((value) => [...combo, { name: type.name, value }])),
    [[]],
  )
}

let idCounter = 0
function nextId(prefix: string): string {
  idCounter += 1
  return `${prefix}-${idCounter}`
}

interface OptionTypeRowState {
  id: string
  name: string
  /** Raw comma-separated text as typed — kept separate from the derived
   * `values[]` so a trailing/mid-typing comma doesn't get eaten on every
   * keystroke (mirrors `product-form.tsx`'s `materialTagsInput`). */
  valuesInput: string
}

interface NewVariantRowState {
  id: string
  sku: string
  inventory: string
  priceNgn: string
  priceUsd: string
  options: { name: string; value: string }[]
}

interface BuilderState {
  optionTypeRows: OptionTypeRowState[]
  newVariantRows: NewVariantRowState[]
  deleteVariantIds: string[]
}

/** The `newVariants[]` row shape `createProductSchema`/`updateProductVariants`
 * expect — money already in minor units, inventory already an int. */
export interface NewVariantRow {
  sku: string
  inventory: number
  priceNgnMinor: number | null
  priceUsdMinor: number | null
  options: { name: string; value: string }[]
}

export interface VariantsBuilderChange {
  optionTypes: { name: string; values: string[] }[]
  newVariants: NewVariantRow[]
  deleteVariantIds: string[]
  /** True when two or more `newVariants` rows share a SKU, OR a
   * `newVariants` row's SKU collides with an `existingVariants[].sku`
   * (case-insensitive, blanks ignored either way). The FORM decides
   * whether that blocks submit — this component only reports it, alongside
   * the full state (still emitted, not filtered), and shows its own inline
   * hint. The server (`conflict-sku`) stays authoritative regardless. */
  hasSkuConflict: boolean
}

export interface ExistingVariantSummary {
  id: string
  sku: string
  options: { name: string; value: string }[]
  hasOrders?: boolean
}

interface VariantsBuilderProps {
  mode: 'create' | 'edit'
  initialOptionTypes: { name: string; values: string[] }[]
  existingVariants: ExistingVariantSummary[]
  onChange: (state: VariantsBuilderChange) => void
}

function initialOptionTypeRows(optionTypes: { name: string; values: string[] }[]): OptionTypeRowState[] {
  return optionTypes.map((optionType) => ({
    id: nextId('ot'),
    name: optionType.name,
    valuesInput: optionType.values.join(', '),
  }))
}

function deriveChange(state: BuilderState, existingVariants: ExistingVariantSummary[]): VariantsBuilderChange {
  const optionTypes = state.optionTypeRows.map((row) => ({
    name: row.name.trim(),
    values: parseValuesInput(row.valuesInput),
  }))
  const newVariants: NewVariantRow[] = state.newVariantRows.map((row) => ({
    sku: row.sku.trim(),
    inventory: toInt(row.inventory),
    priceNgnMinor: toMinorNullable(row.priceNgn),
    priceUsdMinor: toMinorNullable(row.priceUsd),
    options: row.options,
  }))

  const duplicateKeys = duplicateSkuKeysFor(
    newVariants.map((variant) => variant.sku),
    existingVariants.map((variant) => variant.sku),
  )

  return { optionTypes, newVariants, deleteVariantIds: state.deleteVariantIds, hasSkuConflict: duplicateKeys.size > 0 }
}

/**
 * CONTROLLED, presentation-only builder for a product's option types + new
 * variants (T6, phase 8c-2). No actions live here — every edit is folded
 * into local state and the COMPLETE derived payload is reported to the
 * caller via `onChange`; the surrounding form (T7 edit page / T8 create
 * form) owns the actual submit. In `create` mode `existingVariants` is
 * always `[]`; in `edit` mode those rows render read-only (SKU + options
 * only — this component never edits an existing variant's own SKU/price/
 * inventory, `product-form.tsx`'s own variant rows already own that) with a
 * Delete toggle that adds/removes the id in `deleteVariantIds` — except a
 * `hasOrders: true` row, which renders a "can't delete" note and no toggle
 * at all, since deleting it is refused server-side
 * (`updateProductVariants`'s `'variant-has-orders'` guard).
 *
 * Money at this component's boundary follows the exact same rule as
 * `product-form.tsx`: every price input is major units on screen, minor
 * units in the emitted payload, converted ONLY via that file's exported
 * `toMinorNullable`/`minorToMajorNullable` pair (re-exported there for this
 * reuse). Inventory is a plain int (`toInt`, private copy here — not a
 * money boundary).
 */
export function VariantsBuilder({ mode, initialOptionTypes, existingVariants, onChange }: VariantsBuilderProps) {
  const [state, setState] = useState<BuilderState>(() => ({
    optionTypeRows: initialOptionTypeRows(initialOptionTypes),
    newVariantRows: [],
    deleteVariantIds: [],
  }))

  function commit(next: BuilderState) {
    setState(next)
    onChange(deriveChange(next, existingVariants))
  }

  /** Shared by the three option-type edits below: applies the option-type
   * change, then purges any `newVariantRows` that edit desynced (see
   * `purgeDesyncedRows`), and commits both together in one state update /
   * one `onChange`. */
  function commitOptionTypeRows(optionTypeRows: OptionTypeRowState[]) {
    commit({ ...state, optionTypeRows, newVariantRows: purgeDesyncedRows(state.newVariantRows, optionTypeRows) })
  }

  function addOptionType() {
    if (state.optionTypeRows.length >= MAX_OPTION_TYPES) return
    // Adding a type can't desync any existing row's options, so this one
    // skips the purge and goes straight through `commit`.
    commit({ ...state, optionTypeRows: [...state.optionTypeRows, { id: nextId('ot'), name: '', valuesInput: '' }] })
  }

  function removeOptionType(id: string) {
    commitOptionTypeRows(state.optionTypeRows.filter((row) => row.id !== id))
  }

  function updateOptionTypeName(id: string, name: string) {
    commitOptionTypeRows(state.optionTypeRows.map((row) => (row.id === id ? { ...row, name } : row)))
  }

  function updateOptionTypeValues(id: string, valuesInput: string) {
    commitOptionTypeRows(state.optionTypeRows.map((row) => (row.id === id ? { ...row, valuesInput } : row)))
  }

  function handleGenerate() {
    const eligibleTypes = state.optionTypeRows
      .map((row) => ({ name: row.name.trim(), values: parseValuesInput(row.valuesInput) }))
      .filter((type) => type.name !== '' && type.values.length > 0)
    if (eligibleTypes.length === 0) return

    const existingKeys = new Set(existingVariants.map((variant) => optionsKey(variant.options)))
    const seenKeys = new Set(state.newVariantRows.map((row) => optionsKey(row.options)))

    const rowsToAdd: NewVariantRowState[] = []
    for (const combo of cartesianProduct(eligibleTypes)) {
      const key = optionsKey(combo)
      if (existingKeys.has(key) || seenKeys.has(key)) continue
      seenKeys.add(key)
      rowsToAdd.push({
        id: nextId('nv'),
        sku: '',
        inventory: '',
        priceNgn: minorToMajorNullable(null),
        priceUsd: minorToMajorNullable(null),
        options: combo,
      })
    }
    if (rowsToAdd.length === 0) return
    commit({ ...state, newVariantRows: [...state.newVariantRows, ...rowsToAdd] })
  }

  function updateNewVariantRow(id: string, patch: Partial<NewVariantRowState>) {
    commit({ ...state, newVariantRows: state.newVariantRows.map((row) => (row.id === id ? { ...row, ...patch } : row)) })
  }

  function removeNewVariantRow(id: string) {
    commit({ ...state, newVariantRows: state.newVariantRows.filter((row) => row.id !== id) })
  }

  function toggleDelete(id: string) {
    const deleteVariantIds = state.deleteVariantIds.includes(id)
      ? state.deleteVariantIds.filter((existingId) => existingId !== id)
      : [...state.deleteVariantIds, id]
    commit({ ...state, deleteVariantIds })
  }

  const duplicateSkuKeys = duplicateSkuKeysFor(
    state.newVariantRows.map((row) => row.sku),
    existingVariants.map((variant) => variant.sku),
  )

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Options</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {state.optionTypeRows.map((row) => (
            <div key={row.id} className="flex flex-col gap-3 rounded-xl border border-border p-3 sm:flex-row sm:items-end">
              <div className="flex flex-1 flex-col gap-1">
                <Label htmlFor={`vb-option-name-${row.id}`}>Option name</Label>
                <Input
                  id={`vb-option-name-${row.id}`}
                  value={row.name}
                  placeholder="Size"
                  onChange={(e) => updateOptionTypeName(row.id, e.target.value)}
                />
              </div>
              <div className="flex flex-1 flex-col gap-1">
                <Label htmlFor={`vb-option-values-${row.id}`}>Values</Label>
                <Input
                  id={`vb-option-values-${row.id}`}
                  value={row.valuesInput}
                  placeholder="Small, Medium, Large"
                  onChange={(e) => updateOptionTypeValues(row.id, e.target.value)}
                />
              </div>
              <Button type="button" variant="destructive" size="sm" onClick={() => removeOptionType(row.id)}>
                Remove option
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start"
            disabled={state.optionTypeRows.length >= MAX_OPTION_TYPES}
            onClick={addOptionType}
          >
            Add option type
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Variants</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Button type="button" variant="outline" className="self-start" onClick={handleGenerate}>
            Generate variants
          </Button>

          {duplicateSkuKeys.size > 0 ? (
            <p role="alert" className="text-sm text-destructive">
              Duplicate SKUs — fix before saving.
            </p>
          ) : null}

          {state.newVariantRows.length > 0 ? (
            <div className="flex flex-col gap-3">
              {state.newVariantRows.map((row) => {
                const label = row.options.length > 0 ? row.options.map((option) => option.value).join(' / ') : 'New variant'
                const hasConflict = row.sku.trim() !== '' && duplicateSkuKeys.has(row.sku.trim().toLowerCase())
                return (
                  <div key={row.id} className="flex flex-col gap-3 rounded-xl border border-border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-foreground">{label}</p>
                      <Button type="button" variant="destructive" size="sm" onClick={() => removeNewVariantRow(row.id)}>
                        Remove row
                      </Button>
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="flex flex-col gap-1">
                        <Label htmlFor={`vb-new-${row.id}-sku`}>{`${label} SKU`}</Label>
                        <Input
                          id={`vb-new-${row.id}-sku`}
                          aria-label={`${label} SKU`}
                          value={row.sku}
                          placeholder={suggestedSku(row.options)}
                          onChange={(e) => updateNewVariantRow(row.id, { sku: e.target.value })}
                        />
                        {hasConflict ? (
                          <p role="alert" className="text-sm text-destructive">
                            Duplicate SKU
                          </p>
                        ) : null}
                      </div>
                      <div className="flex flex-col gap-1">
                        <Label htmlFor={`vb-new-${row.id}-inventory`}>{`${label} inventory`}</Label>
                        <Input
                          id={`vb-new-${row.id}-inventory`}
                          aria-label={`${label} inventory`}
                          type="number"
                          value={row.inventory}
                          onChange={(e) => updateNewVariantRow(row.id, { inventory: e.target.value })}
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <Label htmlFor={`vb-new-${row.id}-price-ngn`}>{`${label} price override (NGN)`}</Label>
                        <Input
                          id={`vb-new-${row.id}-price-ngn`}
                          aria-label={`${label} price override (NGN)`}
                          type="number"
                          step="0.01"
                          value={row.priceNgn}
                          onChange={(e) => updateNewVariantRow(row.id, { priceNgn: e.target.value })}
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <Label htmlFor={`vb-new-${row.id}-price-usd`}>{`${label} price override (USD)`}</Label>
                        <Input
                          id={`vb-new-${row.id}-price-usd`}
                          aria-label={`${label} price override (USD)`}
                          type="number"
                          step="0.01"
                          value={row.priceUsd}
                          onChange={(e) => updateNewVariantRow(row.id, { priceUsd: e.target.value })}
                        />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {mode === 'edit' && existingVariants.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Existing variants</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {existingVariants.map((variant) => {
              const label = variant.options.length > 0 ? variant.options.map((option) => option.value).join(' / ') : variant.sku
              const marked = state.deleteVariantIds.includes(variant.id)
              return (
                <div key={variant.id} className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
                  <div className="flex flex-col">
                    <p className="text-sm font-medium text-foreground">{label}</p>
                    <p className="text-xs text-muted-foreground">{variant.sku}</p>
                  </div>
                  {variant.hasOrders ? (
                    <p className="text-xs text-muted-foreground">has orders — can&apos;t delete</p>
                  ) : (
                    <label className="flex items-center gap-2 text-sm text-foreground">
                      <input type="checkbox" checked={marked} onChange={() => toggleDelete(variant.id)} />
                      Delete
                    </label>
                  )}
                </div>
              )
            })}
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
