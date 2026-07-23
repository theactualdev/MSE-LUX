import { expect, it, vi } from 'vitest'
vi.mock('@/services/fx/provider', () => ({
  openErApiFxProvider: { getUsdRates: vi.fn() },
  pickFxRates: (f: unknown) => (f ? { rates: f, source: 'live' } : { rates: { GBP: 0.79 }, source: 'backstop' }),
}))
import { GET } from './route'
import { openErApiFxProvider } from '@/services/fx/provider'

it('returns live rates when the provider succeeds', async () => {
  ;(openErApiFxProvider.getUsdRates as ReturnType<typeof vi.fn>).mockResolvedValue({ GBP: 0.8, EUR: 0.9 })
  const body = await (await GET()).json()
  expect(body).toMatchObject({ base: 'USD', source: 'live', rates: { GBP: 0.8, EUR: 0.9 } })
  expect(typeof body.asOf).toBe('string')
})
it('falls back to backstop when the provider throws — never errors', async () => {
  ;(openErApiFxProvider.getUsdRates as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('down'))
  const res = await GET()
  expect(res.status).toBe(200)
  expect((await res.json()).source).toBe('backstop')
})
