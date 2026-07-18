'use client'

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import type { FaqGroup } from '@/features/content/types'

interface FaqAccordionProps {
  groups: FaqGroup[]
}

/** Renders each FAQ group as an `<h2>` heading followed by an accordion of its questions. */
export function FaqAccordion({ groups }: FaqAccordionProps) {
  return (
    <div className="flex flex-col gap-8">
      {groups.map((group, groupIndex) => (
        <section key={group.heading} className="flex flex-col gap-2">
          <h2 className="font-display text-2xl font-semibold text-foreground sm:text-3xl">{group.heading}</h2>
          <Accordion>
            {group.items.map((item, itemIndex) => (
              <AccordionItem key={item.q} value={`${groupIndex}-${itemIndex}`}>
                <AccordionTrigger>{item.q}</AccordionTrigger>
                <AccordionContent>
                  <p className="text-sm text-muted-foreground sm:text-base">{item.a}</p>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>
      ))}
    </div>
  )
}
