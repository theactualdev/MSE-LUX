import { z } from 'zod'
import type { GiftSelectionItem } from '@/features/gifting/components/gift-selection'

const selectionSchema = z.object({
  productId: z.string().min(1),
  variantId: z.string().min(1).nullable(),
})
const selectionsSchema = z.array(selectionSchema).min(1)

/**
 * Parses the `selections` query param the share page's `GiftSelection`
 * navigated here with (Task 6): a URL-encoded JSON array of
 * `{ productId, variantId }`, `variantId: null` for a variantless product.
 *
 * UX-ONLY. `getGiftShippingRates` and `placeGiftOrder` re-validate every
 * selection against the share's own product list server-side regardless
 * (see `checkout-actions.ts`), so nothing here is a trust boundary — a
 * failure only decides which page renders. A missing param, a repeated param
 * (Next hands back a `string[]` rather than a `string` when a query key
 * appears twice), invalid JSON, or a shape that doesn't match all degrade to
 * `null` rather than throwing, so a malformed or hand-edited URL renders a
 * friendly "start again" state instead of crashing the page.
 *
 * Deliberately NOT `server-only` — it's pure (no DB, no cookies, nothing
 * server-side) and imported by both the checkout page and its unit tests.
 */
export function parseSelections(raw: string | string[] | undefined): GiftSelectionItem[] | null {
  if (typeof raw !== 'string') return null

  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    return null
  }

  const parsed = selectionsSchema.safeParse(json)
  return parsed.success ? parsed.data : null
}
