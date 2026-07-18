import type { ContentPage } from '@/features/content/types'

export const ABOUT_PAGE: ContentPage = {
  title: 'About MSE Lux',
  intro:
    'MSE Lux is a Lagos-based studio making handmade beads, jewelry, and accessories — designed and finished by hand, piece by piece.',
  sections: [
    {
      heading: 'Our story',
      body: [
        'MSE Lux started as a small beading table in Lagos and grew from there, one custom order at a time. Every collection is designed in-house and produced in small batches, so what you see is what actually gets made — no mass-market runs.',
        'We work with local artisans across Lagos to keep the craft alive while building pieces that feel modern enough for everyday wear.',
      ],
    },
    {
      heading: 'How we make our pieces',
      body: [
        'Each piece is strung, knotted, or set by hand in our Lagos workshop. We favor traditional beading techniques paired with contemporary shapes and finishes, which is why no two pieces are ever perfectly identical — that variation is part of the handmade character, not a flaw.',
        'Small-batch production means restocks can take time, but it also means closer quality checks on every order before it ships.',
      ],
    },
    {
      heading: 'Materials & care',
      body: [
        'We work primarily with brass, glass and stone beads, and plated findings. Where a piece uses a specific metal or stone, that detail is listed on the product page.',
        'To keep your pieces looking their best: avoid prolonged contact with water, perfume, and lotion, store items separately in a soft pouch, and wipe down with a dry, soft cloth after wear.',
      ],
    },
    {
      heading: 'Visiting us',
      body: [
        'We are based in Lagos, Nigeria, and welcome studio visits by appointment. Reach out on Instagram or by email to book a time to see and try on pieces in person.',
      ],
    },
  ],
}
