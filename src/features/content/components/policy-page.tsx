import { ContentPageView } from '@/features/content/components/content-page'
import type { PolicyPage } from '@/features/content/types'

interface PolicyPageViewProps {
  page: PolicyPage
}

/** Renders a `PolicyPage`: same as `ContentPageView` plus a muted "Last updated" line under the title. */
export function PolicyPageView({ page }: PolicyPageViewProps) {
  const formatted = new Date(page.lastUpdated).toLocaleDateString('en-NG', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  return (
    <ContentPageView
      page={page}
      meta={<p className="text-sm text-muted-foreground">Last updated {formatted}</p>}
    />
  )
}
