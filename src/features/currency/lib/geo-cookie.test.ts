import { expect, it, vi } from 'vitest'
import { applyCurrencyCookie, CURRENCY_COOKIE } from './geo-cookie'

function fakeReq(country: string | null, existing?: string) {
  return {
    headers: { get: (k: string) => (k === 'x-vercel-ip-country' ? country : null) },
    cookies: { get: (n: string) => (n === CURRENCY_COOKIE && existing ? { value: existing } : undefined) },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- fake request only needs the two fields the SUT reads
  } as any
}
function fakeRes() {
  const set = vi.fn()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- fake response only needs cookies.set
  return { set, res: { cookies: { set } } as any }
}

it('sets the geo currency cookie when absent', () => {
  const { set, res } = fakeRes()
  applyCurrencyCookie(fakeReq('GB'), res)
  expect(set).toHaveBeenCalledWith(CURRENCY_COOKIE, 'GBP', expect.objectContaining({ path: '/' }))
})
it('does nothing when a cookie already exists (switcher choice wins)', () => {
  const { set, res } = fakeRes()
  applyCurrencyCookie(fakeReq('GB', 'EUR'), res)
  expect(set).not.toHaveBeenCalled()
})
it('does nothing when there is no country header (client defaults to NGN)', () => {
  const { set, res } = fakeRes()
  applyCurrencyCookie(fakeReq(null), res)
  expect(set).not.toHaveBeenCalled()
})
