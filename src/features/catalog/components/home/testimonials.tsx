import { Quote } from 'lucide-react'
import { Container } from '@/components/brand/container'
import { SectionHeading } from '@/components/brand/section-heading'
import { testimonials } from '@/features/catalog/data/home'

/** Three-up grid of customer quotes — subtle, tokens only, no imagery. */
export function Testimonials() {
  return (
    <Container className="flex flex-col gap-8 py-12 sm:py-16">
      <SectionHeading
        title="Loved by our customers"
        subtitle="A few words from the people wearing MSE Lux."
        className="items-center text-center"
      />

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        {testimonials.map((testimonial) => (
          <figure
            key={testimonial.author}
            className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-6 sm:p-8"
          >
            <Quote className="h-5 w-5 text-accent" aria-hidden="true" />
            <blockquote className="text-sm text-muted-foreground sm:text-base">
              &ldquo;{testimonial.quote}&rdquo;
            </blockquote>
            <figcaption className="mt-auto text-sm font-medium text-foreground">
              {testimonial.author}
            </figcaption>
          </figure>
        ))}
      </div>
    </Container>
  )
}
