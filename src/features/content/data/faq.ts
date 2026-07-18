import type { FaqGroup } from '@/features/content/types'

export const FAQ_GROUPS: FaqGroup[] = [
  {
    heading: 'Orders & shipping',
    items: [
      {
        q: 'Where do you ship from?',
        a: 'Every order ships from our workshop in Lagos, Nigeria.',
      },
      {
        q: 'What are your delivery times and rates?',
        a: 'Lagos delivery is ₦2,500 and takes 1–2 days, nationwide delivery is ₦5,000 and takes 3–5 days, and international delivery is ₦20,000 and takes 7–14 days. These times run from dispatch — because pieces are handmade, allow 2–3 business days for us to prepare your order first.',
      },
      {
        q: 'Is VAT included in the price shown?',
        a: 'Prices are shown before tax. A 7.5% VAT is calculated on your order subtotal and shown separately at checkout before you pay.',
      },
      {
        q: 'Can I track my order?',
        a: 'Yes — once your order ships you will receive a confirmation email with tracking details for your delivery.',
      },
    ],
  },
  {
    heading: 'Products & care',
    items: [
      {
        q: 'What materials do you use?',
        a: 'We work mainly with brass, glass and stone beads, and plated findings. The specific materials for each piece are listed on its product page.',
      },
      {
        q: 'Why might my piece look slightly different from the photo?',
        a: 'Every piece is handmade in small batches, so small variations in bead placement, color, or finish are normal and part of the handmade character — not a defect.',
      },
      {
        q: 'How do I care for my jewelry?',
        a: 'Avoid prolonged contact with water, perfume, and lotion, store pieces separately in a soft pouch, and wipe them down with a dry, soft cloth after wear.',
      },
      {
        q: 'Do you offer custom pieces?',
        a: 'Yes, we take custom and bespoke orders. Reach out to us on Instagram or by email with your idea and we will follow up on timing and pricing.',
      },
    ],
  },
  {
    heading: 'Returns & exchanges',
    items: [
      {
        q: 'What is your return policy?',
        a: 'Unworn items in original packaging can be returned within 7 days of delivery for a refund or exchange. See our Shipping & Returns page for the full policy.',
      },
      {
        q: 'Can I exchange an item for a different size or color?',
        a: 'Yes, subject to stock availability — contact us within 7 days of delivery to arrange an exchange. Some items are excluded: pierced earrings once opened, and custom or made-to-order pieces, which are final sale. See our Shipping & Returns policy for the full details.',
      },
      {
        q: 'Are custom or made-to-order pieces returnable?',
        a: 'Custom and made-to-order pieces are final sale and are not eligible for return or exchange, unless the item arrives damaged or faulty.',
      },
    ],
  },
]
