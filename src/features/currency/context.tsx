'use client'
import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'
import type { Currency, FxRates } from '@/types/money'
import { DEFAULT_CURRENCY, isSupportedCurrency } from './lib/currencies'
import { CURRENCY_COOKIE } from './lib/geo-cookie'
import { BACKSTOP_USD_RATES } from '@/services/fx/backstop'

interface Ctx { currency: Currency; rates: FxRates; setCurrency: (c: Currency) => void }
const CurrencyContext = createContext<Ctx | null>(null)
const ONE_YEAR = 60 * 60 * 24 * 365

function readCookie(): Currency | null {
  const m = document.cookie.match(new RegExp(`(?:^|; )${CURRENCY_COOKIE}=([^;]+)`))
  const v = m?.[1]
  return v && isSupportedCurrency(v) ? v : null
}

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [currency, setCurrencyState] = useState<Currency>(DEFAULT_CURRENCY)
  const [rates, setRates] = useState<FxRates>(BACKSTOP_USD_RATES)

  useEffect(() => {
    let alive = true
    // Deferred to a microtask so this mount effect's state update lands
    // AFTER the synchronous initial-render flush (React/act() flush a
    // purely-synchronous effect body before render() returns), preserving
    // the NGN-matches-SSR first paint that the hydration contract requires.
    Promise.resolve().then(() => {
      if (!alive) return
      const fromCookie = readCookie()
      if (fromCookie) setCurrencyState(fromCookie)
    })
    fetch('/api/fx-rates')
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => { if (alive && body?.rates) setRates(body.rates) })
      .catch(() => {}) // keep backstop
    return () => { alive = false }
  }, [])

  const setCurrency = useCallback((c: Currency) => {
    setCurrencyState(c)
    document.cookie = `${CURRENCY_COOKIE}=${c}; path=/; max-age=${ONE_YEAR}; samesite=lax`
  }, [])

  return <CurrencyContext.Provider value={{ currency, rates, setCurrency }}>{children}</CurrencyContext.Provider>
}

function useCtx(): Ctx {
  const ctx = useContext(CurrencyContext)
  // Fallback keeps non-wrapped units (tests, isolated renders) safe: NGN, backstop rates.
  return ctx ?? { currency: DEFAULT_CURRENCY, rates: BACKSTOP_USD_RATES, setCurrency: () => {} }
}
export function useDisplayCurrency(): Currency { return useCtx().currency }
export function useFxRates(): FxRates { return useCtx().rates }
export function useSetCurrency(): (c: Currency) => void { return useCtx().setCurrency }
