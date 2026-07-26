import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { VariantsBuilder, type VariantsBuilderChange } from '@/features/admin/catalog/components/variants-builder'

function getGroups() {
  // Every option-type row and every new-variant row is a `rounded-xl` bordered
  // group — same query idiom as `image-manager.test.tsx`'s `getRows()`.
  return screen
    .getAllByRole('textbox')
    .map((el) => el.closest('div.rounded-xl'))
    .filter((el, index, all) => el && all.indexOf(el) === index) as HTMLDivElement[]
}

type OnChangeMock = ReturnType<typeof vi.fn<(state: VariantsBuilderChange) => void>>

function lastChange(onChange: OnChangeMock): VariantsBuilderChange {
  const calls = onChange.mock.calls
  expect(calls.length).toBeGreaterThan(0)
  return calls[calls.length - 1][0]
}

const SIZE_COLOR_TYPES = [
  { name: 'Size', values: ['Small', 'Large'] },
  { name: 'Color', values: ['Gold', 'Silver'] },
]

describe('VariantsBuilder', () => {
  let onChange: OnChangeMock

  beforeEach(() => {
    onChange = vi.fn<(state: VariantsBuilderChange) => void>()
  })

  it('does not call onChange on initial render — only on an actual edit', () => {
    render(<VariantsBuilder mode="create" initialOptionTypes={[]} existingVariants={[]} onChange={onChange} />)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('seeds option-type rows from initialOptionTypes with name + comma-joined values', () => {
    render(<VariantsBuilder mode="create" initialOptionTypes={SIZE_COLOR_TYPES} existingVariants={[]} onChange={onChange} />)

    expect(screen.getByDisplayValue('Size')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Small, Large')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Color')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Gold, Silver')).toBeInTheDocument()
  })

  it('add option type appends a blank row and disables the button at 3 types', async () => {
    const user = userEvent.setup({ delay: null })
    render(<VariantsBuilder mode="create" initialOptionTypes={SIZE_COLOR_TYPES} existingVariants={[]} onChange={onChange} />)

    const addButton = screen.getByRole('button', { name: /add option type/i })
    expect(addButton).toBeEnabled()

    await user.click(addButton)
    expect(lastChange(onChange).optionTypes).toHaveLength(3)
    expect(addButton).toBeDisabled()
  })

  it('editing an option-type name and its comma-separated values emits parsed, trimmed, capped optionTypes', async () => {
    const user = userEvent.setup({ delay: null })
    render(<VariantsBuilder mode="create" initialOptionTypes={[]} existingVariants={[]} onChange={onChange} />)

    await user.click(screen.getByRole('button', { name: /add option type/i }))
    await user.type(screen.getByLabelText(/option name/i), 'Size')
    await user.type(screen.getByLabelText(/^values$/i), ' Small ,Medium, Small ')

    const change = lastChange(onChange)
    expect(change.optionTypes).toEqual([{ name: 'Size', values: ['Small', 'Medium', 'Small'] }])
  })

  it('caps parsed values at 20 even when more are typed', async () => {
    const user = userEvent.setup({ delay: null })
    render(<VariantsBuilder mode="create" initialOptionTypes={[]} existingVariants={[]} onChange={onChange} />)

    await user.click(screen.getByRole('button', { name: /add option type/i }))
    const manyValues = Array.from({ length: 25 }, (_, i) => `V${i}`).join(',')
    await user.type(screen.getByLabelText(/^values$/i), manyValues)

    expect(lastChange(onChange).optionTypes[0].values).toHaveLength(20)
  })

  it('remove option type drops it from the emitted optionTypes', async () => {
    const user = userEvent.setup({ delay: null })
    render(<VariantsBuilder mode="create" initialOptionTypes={SIZE_COLOR_TYPES} existingVariants={[]} onChange={onChange} />)

    const groups = getGroups()
    await user.click(within(groups[0]).getByRole('button', { name: /remove option/i }))

    const change = lastChange(onChange)
    expect(change.optionTypes).toHaveLength(1)
    expect(change.optionTypes[0].name).toBe('Color')
  })

  it('Generate variants builds the cartesian product, skipping combos already in existingVariants', async () => {
    const user = userEvent.setup({ delay: null })
    render(
      <VariantsBuilder
        mode="edit"
        initialOptionTypes={SIZE_COLOR_TYPES}
        existingVariants={[
          { id: 'v1', sku: 'EXIST-1', options: [{ name: 'Size', value: 'Small' }, { name: 'Color', value: 'Gold' }] },
        ]}
        onChange={onChange}
      />,
    )

    await user.click(screen.getByRole('button', { name: /generate variants/i }))

    const change = lastChange(onChange)
    expect(change.newVariants).toHaveLength(3)
    const optionSets = change.newVariants.map((v) => v.options.map((o) => `${o.name}:${o.value}`).sort().join('|'))
    expect(optionSets).not.toContain('Color:Gold|Size:Small')
    expect(optionSets).toContain('Color:Silver|Size:Small')
    expect(optionSets).toContain('Color:Gold|Size:Large')
    expect(optionSets).toContain('Color:Silver|Size:Large')
    // Freshly generated rows default to blank sku, zero inventory, null prices.
    for (const variant of change.newVariants) {
      expect(variant.sku).toBe('')
      expect(variant.inventory).toBe(0)
      expect(variant.priceNgnMinor).toBeNull()
      expect(variant.priceUsdMinor).toBeNull()
    }
  })

  it('Generate variants is idempotent — clicking twice does not duplicate already-generated rows', async () => {
    const user = userEvent.setup({ delay: null })
    render(<VariantsBuilder mode="create" initialOptionTypes={SIZE_COLOR_TYPES} existingVariants={[]} onChange={onChange} />)

    await user.click(screen.getByRole('button', { name: /generate variants/i }))
    expect(lastChange(onChange).newVariants).toHaveLength(4)

    await user.click(screen.getByRole('button', { name: /generate variants/i }))
    expect(lastChange(onChange).newVariants).toHaveLength(4)
  })

  it('per-row sku/inventory/price edits convert at the money boundary — blank price is null, blank inventory is 0', async () => {
    const user = userEvent.setup({ delay: null })
    render(
      <VariantsBuilder mode="create" initialOptionTypes={[{ name: 'Size', values: ['Small'] }]} existingVariants={[]} onChange={onChange} />,
    )
    await user.click(screen.getByRole('button', { name: /generate variants/i }))

    const skuInput = screen.getByLabelText(/small sku/i)
    expect(skuInput).toHaveValue('')
    expect(skuInput).toHaveAttribute('placeholder', 'SMALL')

    await user.type(skuInput, 'RING-SM')
    await user.type(screen.getByLabelText(/small inventory/i), '5')
    await user.type(screen.getByLabelText(/small price override \(ngn\)/i), '45000')
    await user.type(screen.getByLabelText(/small price override \(usd\)/i), '30')

    const change = lastChange(onChange)
    expect(change.newVariants).toEqual([
      {
        sku: 'RING-SM',
        inventory: 5,
        priceNgnMinor: 4_500_000,
        priceUsdMinor: 3_000,
        options: [{ name: 'Size', value: 'Small' }],
      },
    ])
  })

  it('remove-row drops a generated variant row', async () => {
    const user = userEvent.setup({ delay: null })
    render(<VariantsBuilder mode="create" initialOptionTypes={[{ name: 'Size', values: ['Small'] }]} existingVariants={[]} onChange={onChange} />)

    await user.click(screen.getByRole('button', { name: /generate variants/i }))
    expect(lastChange(onChange).newVariants).toHaveLength(1)

    await user.click(screen.getByRole('button', { name: /remove row/i }))
    expect(lastChange(onChange).newVariants).toHaveLength(0)
  })

  it('duplicate SKUs across new rows (case-insensitive, blanks ignored) show an inline error but still emit the full state', async () => {
    const user = userEvent.setup({ delay: null })
    render(
      <VariantsBuilder
        mode="create"
        initialOptionTypes={[{ name: 'Size', values: ['Small', 'Large'] }]}
        existingVariants={[]}
        onChange={onChange}
      />,
    )
    await user.click(screen.getByRole('button', { name: /generate variants/i }))

    await user.type(screen.getByLabelText(/small sku/i), 'RING-1')
    await user.type(screen.getByLabelText(/large sku/i), 'ring-1')

    const change = lastChange(onChange)
    expect(change.hasSkuConflict).toBe(true)
    expect(change.newVariants).toHaveLength(2)
    expect(change.newVariants.map((v) => v.sku)).toEqual(['RING-1', 'ring-1'])
    expect(screen.getAllByText(/duplicate sku/i).length).toBeGreaterThan(0)
  })

  it('existing-variant rows render read-only with a Delete toggle that adds/removes the id in deleteVariantIds', async () => {
    const user = userEvent.setup({ delay: null })
    render(
      <VariantsBuilder
        mode="edit"
        initialOptionTypes={[]}
        existingVariants={[{ id: 'v1', sku: 'SKU-1', options: [{ name: 'Size', value: 'Small' }] }]}
        onChange={onChange}
      />,
    )

    expect(screen.getByText('Small')).toBeInTheDocument()
    expect(screen.getByText('SKU-1')).toBeInTheDocument()
    // Read-only: no textbox for this existing variant's own sku.
    expect(screen.queryByRole('textbox', { name: /^sku-1/i })).not.toBeInTheDocument()

    const checkbox = screen.getByRole('checkbox', { name: /delete/i })
    await user.click(checkbox)
    expect(lastChange(onChange).deleteVariantIds).toEqual(['v1'])

    await user.click(checkbox)
    expect(lastChange(onChange).deleteVariantIds).toEqual([])
  })

  it('a variant with hasOrders renders a can\'t-delete note and no delete toggle', () => {
    render(
      <VariantsBuilder
        mode="edit"
        initialOptionTypes={[]}
        existingVariants={[{ id: 'v1', sku: 'SKU-1', options: [], hasOrders: true }]}
        onChange={onChange}
      />,
    )

    expect(screen.getByText(/has orders/i)).toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('create mode with no existingVariants renders no "Existing variants" section', () => {
    render(<VariantsBuilder mode="create" initialOptionTypes={[]} existingVariants={[]} onChange={onChange} />)
    expect(screen.queryByText(/existing variants/i)).not.toBeInTheDocument()
  })
})
