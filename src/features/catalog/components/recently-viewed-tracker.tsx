'use client'

import { useEffect } from 'react'
import { useRecentlyViewedStore } from '@/features/catalog/hooks/use-recently-viewed'

interface RecentlyViewedTrackerProps {
  productId: string
}

/**
 * Invisible PDP tracker: records `productId` into the recently-viewed store
 * on mount. This calls an external store's action, not a local `useState`
 * setter, so a plain effect is the correct (lint-safe) tool here — the
 * repo's "no sync setState in effect" concern only applies to component
 * state, which this component doesn't have.
 */
export function RecentlyViewedTracker({ productId }: RecentlyViewedTrackerProps) {
  const add = useRecentlyViewedStore((state) => state.add)

  useEffect(() => {
    add(productId)
  }, [productId, add])

  return null
}
