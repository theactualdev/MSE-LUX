import type { Metadata } from 'next'
import { Container } from '@/components/brand/container'
import { ContactForm } from '@/features/content/components/contact-form'
import { CONTACT_INFO } from '@/features/content/data/contact'

export const metadata: Metadata = {
  title: 'Contact',
  description: 'Get in touch with MSE Lux — email, Instagram DM, or send us a message directly.',
}

export default function ContactPage() {
  return (
    <Container className="flex flex-col gap-10 py-12 sm:py-16">
      <h1 className="font-display text-3xl font-semibold text-foreground sm:text-4xl">Contact us</h1>

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-2">
        <div className="flex flex-col gap-4 text-sm text-muted-foreground sm:text-base">
          <h2 className="font-display text-2xl font-semibold text-foreground sm:text-3xl">Reach us directly</h2>
          <p>
            Email:{' '}
            <a href={`mailto:${CONTACT_INFO.email}`} className="text-foreground underline underline-offset-4">
              {CONTACT_INFO.email}
            </a>
          </p>
          <p>
            Instagram:{' '}
            <a
              href={CONTACT_INFO.instagram}
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground underline underline-offset-4"
            >
              @{CONTACT_INFO.instagram.split('/').filter(Boolean).pop()}
            </a>
          </p>
          <p>Location: {CONTACT_INFO.location}</p>
          <p>Hours: {CONTACT_INFO.hours}</p>
          <p>{CONTACT_INFO.responseTime}</p>
        </div>

        <div className="flex flex-col gap-4">
          <h2 className="font-display text-2xl font-semibold text-foreground sm:text-3xl">Send us a message</h2>
          <ContactForm />
        </div>
      </div>
    </Container>
  )
}
