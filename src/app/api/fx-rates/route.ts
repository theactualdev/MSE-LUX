import { NextResponse } from 'next/server'
import { openErApiFxProvider, pickFxRates } from '@/services/fx/provider'

// Cached daily; display FX needs no real-time. The client fetches this once on mount,
// so the upstream free API is hit at most ~once/day per deployment.
export const revalidate = 86_400

export async function GET() {
  let fetched = null
  try {
    fetched = await openErApiFxProvider.getUsdRates()
  } catch {
    fetched = null
  }
  const { rates, source } = pickFxRates(fetched)
  return NextResponse.json({ base: 'USD', rates, source, asOf: new Date().toISOString() })
}
