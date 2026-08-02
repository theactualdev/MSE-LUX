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
        a: "If you're paying in Naira to a Nigerian address, we get you a live courier rate and delivery estimate at checkout, based on your address — as a guide, Lagos is usually 2–5 business days and elsewhere in Nigeria 5–10 days. International orders ship at a flat rate and typically take 2–3 weeks, shown at checkout before you pay. All of those windows run from dispatch, not the order date — because pieces are handmade, allow 5–8 days for us to prepare your order first, or 2–3 weeks for personalised and custom pieces.",
      },
      {
        q: 'What payment methods do you accept?',
        a: "We accept card payments through Paystack. You choose to pay in Naira (₦) or US Dollars ($) at checkout, and that's the currency you're charged in — if you're browsing in any other currency, the price shown is just an estimate. We never see or store your card details.",
      },
      {
        q: 'Is VAT included in the price shown?',
        a: 'Prices are shown before tax. A 7.5% VAT is calculated on your order subtotal and shown separately at checkout before you pay.',
      },
      {
        q: 'Can I track my order?',
        a: 'Yes — once your order ships we email you a shipping confirmation with your carrier and tracking number.',
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
        a: "There's no self-service returns portal — contact us with your order number and our team will confirm eligibility and next steps. Unworn items in their original packaging can be returned within 2–3 days of receiving your order for a refund or exchange; approved refunds are issued by our team through Paystack, not automatically. Custom and personalised pieces are final sale. See our Shipping & Returns page for the full policy.",
      },
      {
        q: 'Can I exchange an item for a different size or color?',
        a: "Yes, subject to stock availability — contact us within 2–3 days of receiving your order to arrange an exchange. Some items are excluded: pierced earrings once opened, and custom, personalised or made-to-order pieces, which are final sale. See our Shipping & Returns policy for the full details.",
      },
      {
        q: 'Are custom or made-to-order pieces returnable?',
        a: 'Custom and made-to-order pieces are final sale and are not eligible for return or exchange, unless the item arrives damaged or faulty.',
      },
    ],
  },
]
