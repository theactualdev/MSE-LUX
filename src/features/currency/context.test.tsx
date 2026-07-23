import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import { CurrencyProvider, useDisplayCurrency, useFxRates, useSetCurrency } from './context'

function Probe() {
  const c = useDisplayCurrency(); const rates = useFxRates(); const set = useSetCurrency()
  return <div><span data-testid="c">{c}</span><span data-testid="gbp">{rates.GBP ?? ''}</span><button onClick={() => set('USD')}>usd</button></div>
}

beforeEach(() => { document.cookie = ''; vi.restoreAllMocks() })

it('starts at NGN (matches static HTML) then adopts the cookie + fetched rates', async () => {
  Object.defineProperty(document, 'cookie', { writable: true, value: 'mse-currency=GBP' })
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ rates: { GBP: 0.8 } }) }))
  render(<CurrencyProvider><Probe /></CurrencyProvider>)
  expect(screen.getByTestId('c').textContent).toBe('NGN') // first paint matches SSR
  await waitFor(() => expect(screen.getByTestId('c').textContent).toBe('GBP'))
  await waitFor(() => expect(screen.getByTestId('gbp').textContent).toBe('0.8'))
})
it('ignores an unsupported cookie value and stays at NGN', async () => {
  Object.defineProperty(document, 'cookie', { writable: true, value: 'mse-currency=XYZ' })
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ rates: {} }) }))
  render(<CurrencyProvider><Probe /></CurrencyProvider>)
  await waitFor(() => expect(screen.getByTestId('c').textContent).toBe('NGN'))
})
it('useSetCurrency updates the currency and writes the cookie', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ rates: {} }) }))
  render(<CurrencyProvider><Probe /></CurrencyProvider>)
  act(() => { screen.getByText('usd').click() })
  await waitFor(() => expect(screen.getByTestId('c').textContent).toBe('USD'))
  expect(document.cookie).toContain('mse-currency=USD')
})
