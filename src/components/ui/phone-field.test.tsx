import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PhoneField } from '@/components/ui/phone-field'

/** Renders uncontrolled-from-the-test: we assert on what `onChange` emits. */
function setup(value = '') {
  const onChange = vi.fn()
  render(<PhoneField id="phone" value={value} onChange={onChange} />)
  return { onChange, input: screen.getByRole('textbox'), select: screen.getByLabelText('Dialling code') }
}

describe('PhoneField', () => {
  it('defaults to Nigeria', () => {
    const { select } = setup()
    expect((select as HTMLSelectElement).value).toBe('NG')
  })

  it('emits E.164 for a typed national number', async () => {
    const user = userEvent.setup()
    const { onChange, input } = setup()

    await user.type(input, '08012345678')

    expect(onChange).toHaveBeenLastCalledWith('+2348012345678')
  })

  // A bare dial code would satisfy a `required` check and then reach
  // ShipBubble as an unusable number, so an empty national part must emit
  // empty rather than "+234".
  it('emits an empty string, not a bare dial code, when no digits are entered', async () => {
    const user = userEvent.setup()
    const { onChange, select } = setup()

    await user.selectOptions(select, 'GB')

    expect(onChange).toHaveBeenLastCalledWith('')
  })

  it('re-emits the same digits under a newly chosen country', async () => {
    const user = userEvent.setup()
    const { onChange, input, select } = setup()

    await user.type(input, '7911123456')
    await user.selectOptions(select, 'GB')

    // Switching country must keep the digits — picking the wrong country
    // first is a common slip and wiping the number punishes it.
    expect(onChange).toHaveBeenLastCalledWith('+447911123456')
  })

  it('strips non-digits so pasted formatting cannot corrupt the value', async () => {
    const user = userEvent.setup()
    const { onChange, input } = setup()

    await user.type(input, '(080) 1234-5678')

    expect(onChange).toHaveBeenLastCalledWith('+2348012345678')
  })

  // The country shown is asserted loosely on purpose. `+44` is shared by the
  // UK, Guernsey, Jersey and the Isle of Man, and the `min` metadata this
  // field imports cannot separate them — it resolves a London mobile to GG.
  // That is cosmetic and deliberate: all four share the dial code, so the
  // EMITTED value is byte-identical either way, and full metadata would
  // roughly double the bundle on a checkout whose buyers are mostly on
  // Nigerian mobile data.
  it('reopens an existing E.164 value with a +44 country and the right number', () => {
    const { select, input } = setup('+447911123456')

    expect(['GB', 'GG', 'JE', 'IM']).toContain((select as HTMLSelectElement).value)
    expect((input as HTMLInputElement).value.replace(/\D/g, '')).toBe('7911123456')
  })

  // Addresses saved before this control existed hold local-format numbers.
  // They must stay editable rather than being silently blanked.
  it('keeps a legacy local-format number editable', () => {
    const { select, input } = setup('08012345678')

    expect((select as HTMLSelectElement).value).toBe('NG')
    expect((input as HTMLInputElement).value.replace(/\D/g, '')).toBe('08012345678')
  })
})
