import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CurrencySwitcher } from './currency-switcher'
import { CurrencyProvider } from '@/features/currency/context'

beforeEach(() => {
  document.cookie = ''
})

describe('CurrencySwitcher', () => {
  it('shows the current (default) currency on the trigger', () => {
    render(
      <CurrencyProvider>
        <CurrencySwitcher />
      </CurrencyProvider>,
    )
    expect(screen.getByRole('combobox', { name: /change currency/i })).toHaveTextContent('NGN')
  })

  it('lists all supported currencies and switches on select, persisting the cookie', async () => {
    const user = userEvent.setup()
    render(
      <CurrencyProvider>
        <CurrencySwitcher />
      </CurrencyProvider>,
    )

    const trigger = screen.getByRole('combobox', { name: /change currency/i })
    await user.click(trigger)

    const option = await screen.findByRole('option', { name: 'USD' })
    await user.click(option)

    expect(screen.getByRole('combobox', { name: /change currency/i })).toHaveTextContent('USD')
    expect(document.cookie).toContain('mse-currency=USD')
  })
})
