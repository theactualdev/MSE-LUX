import type { ReactNode } from 'react'
import type { ContentPage } from '@/features/content/types'

interface ContentPageViewProps {
  page: ContentPage
  /** Rendered under the title, before the intro (e.g. a "Last updated" line). */
  meta?: ReactNode
}

/** Renders a `ContentPage`: title as the single `<h1>`, optional intro, then each section as `<h2>` + body paragraphs. */
export function ContentPageView({ page, meta }: ContentPageViewProps) {
  return (
    <article className="flex max-w-prose flex-col gap-8 py-12 sm:py-16">
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-3xl font-semibold text-foreground sm:text-4xl">{page.title}</h1>
        {meta}
      </div>

      {page.intro ? <p className="text-base text-muted-foreground sm:text-lg">{page.intro}</p> : null}

      <div className="flex flex-col gap-8">
        {page.sections.map((section) => (
          <section key={section.heading} className="flex flex-col gap-4">
            <h2 className="font-display text-2xl font-semibold text-foreground sm:text-3xl">{section.heading}</h2>
            {section.body.map((paragraph, index) => (
              <p key={index} className="text-sm text-muted-foreground sm:text-base">
                {paragraph}
              </p>
            ))}
          </section>
        ))}
      </div>
    </article>
  )
}
