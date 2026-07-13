'use client'
import type { Currency } from '@/types/money'

/** Phase 2a: NGN only. Phase 5 replaces this with geo-detection + FX. */
export function useDisplayCurrency(): Currency {
  return 'NGN'
}
