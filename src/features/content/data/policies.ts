/**
 * Placeholder policy copy pending legal review.
 *
 * The text in this file describes, in plain language, how MSE Lux intends to
 * handle shipping, returns, privacy, and terms of use. It has not been
 * reviewed by legal counsel, is not a compliance certification against any
 * named regulation, and is not legal advice. Replace with counsel-approved
 * copy before treating it as binding.
 */
import type { PolicyPage, PolicySlug } from '@/features/content/types'

export const POLICY_PAGES: Record<PolicySlug, PolicyPage> = {
  'shipping-returns': {
    title: 'Shipping & Returns',
    lastUpdated: '2026-07-18',
    intro: 'How we get your order to you, and what to do if something needs to go back.',
    sections: [
      {
        heading: 'Shipping rates & timelines',
        body: [
          "If you're paying in Naira with a delivery address in Nigeria, we calculate your exact shipping cost with our courier partner right at checkout, based on your address and order weight — you'll see the price and an estimated delivery window before you pay. If our courier is temporarily unavailable, we fall back to a flat standard-delivery rate for Nigerian addresses instead.",
          "For every other order — deliveries outside Nigeria, and any order paid in US dollars regardless of destination — shipping is a flat rate, shown at checkout before you pay.",
          'Delivery windows are estimates from the courier, not a fixed promise from us — actual delivery time runs from the date an order ships (not the order date) and can vary with courier volume or, for international orders, customs processing.',
        ],
      },
      {
        heading: 'Order processing',
        body: [
          "Because pieces are handmade in small batches, please allow [TODO(owner): confirm the standard order-processing time to publish here, e.g. '2–3 business days'] before your order ships. Custom or made-to-order pieces may take longer, and we'll confirm the expected timeline with you by email.",
        ],
      },
      {
        heading: 'Returns',
        body: [
          "There is no self-service returns portal. To start a return, contact us with your order number and we'll confirm eligibility and next steps by email.",
          "Unworn items in their original packaging can be returned within [TODO(owner): confirm the return window to publish here, e.g. '7 days'] of delivery for a refund or exchange.",
          'Approved returns and order cancellations are handled by our team, not automatically: we cancel and restock the order, then issue your refund from the Paystack dashboard to your original payment method — refunds are recorded and processed by a person, so please allow a few business days.',
          'Return shipping is the responsibility of the customer unless the item arrived damaged or faulty, in which case we cover the cost.',
        ],
      },
      {
        heading: 'Exceptions',
        body: [
          'Custom and made-to-order pieces are final sale and not eligible for return or exchange, unless they arrive damaged or faulty. Earrings are not returnable for hygiene reasons once opened.',
        ],
      },
      {
        heading: 'Damaged or faulty items',
        body: [
          "If your order arrives damaged or faulty, contact us within [TODO(owner): confirm the reporting window to publish here, e.g. '48 hours'] of delivery with photos of the item and packaging so we can arrange a replacement or refund.",
        ],
      },
    ],
  },
  privacy: {
    title: 'Privacy Policy',
    lastUpdated: '2026-07-18',
    intro: 'What information we collect when you shop with MSE Lux, and how we use it.',
    sections: [
      {
        heading: 'Information we collect',
        body: [
          'When you place an order, create an account, or contact us, we collect the information you provide, such as your name, email address, phone number, shipping address, and order details.',
        ],
      },
      {
        heading: 'How we use your information',
        body: [
          'We use your information to process and deliver orders, respond to inquiries, send order and shipping updates, and improve our products and service.',
          'We do not sell your personal information to third parties.',
        ],
      },
      {
        heading: 'Sharing with service providers',
        body: [
          'We share limited order information with our delivery courier, our payment processor (Paystack), and the service we use to send transactional emails (order confirmations and shipping updates). These providers only receive the information they need to complete their part of the transaction.',
          "We never see or store your card details — payment is handled entirely by Paystack, and card numbers never reach our servers.",
        ],
      },
      {
        heading: 'Cookies & tracking',
        body: [
          "We don't run analytics, advertising, or tracking cookies of our own. The only data collection beyond what's described above is the standard technical logging our hosting provider keeps to operate the site.",
        ],
      },
      {
        heading: 'Data retention & access',
        body: [
          'We keep account information (name, email, phone), saved addresses, cart and wishlist contents, and order records for as long as needed to provide our service and meet reasonable business record-keeping needs. You can ask us to review, update, or delete your information at any time by contacting us.',
        ],
      },
      {
        heading: 'Contact us',
        body: [
          'If you have questions about this policy or how your data is handled, reach out to us by email or Instagram and we will get back to you.',
        ],
      },
    ],
  },
  terms: {
    title: 'Terms of Service',
    lastUpdated: '2026-07-18',
    intro: 'The basics of shopping with MSE Lux online.',
    sections: [
      {
        heading: 'About this site',
        body: [
          'This website is operated by MSE Lux, a handmade jewelry and accessories studio based in Lagos, Nigeria. By using this site or placing an order, you agree to the practices described here.',
        ],
      },
      {
        heading: 'Orders & pricing',
        body: [
          "Prices are shown in Naira (₦) or US Dollars ($) — whichever currency you select — before the 7.5% VAT applied on your order subtotal at checkout. If you're browsing in a different currency, that price is an estimate only; you're always charged in ₦ or $. We reserve the right to correct pricing errors and to limit order quantities.",
        ],
      },
      {
        heading: 'Payment',
        body: [
          'Payment is processed by Paystack. We accept card payments, and you are charged in whichever currency you selected at checkout (₦ or $) — we never see or store your card details.',
        ],
      },
      {
        heading: 'Product listings',
        body: [
          'We aim to describe and photograph products as accurately as possible. Because pieces are handmade, slight variations in color, size, or finish between the photo and the item you receive are normal and expected.',
        ],
      },
      {
        heading: 'Intellectual property',
        body: [
          'All designs, photography, and text on this site belong to MSE Lux unless otherwise noted, and may not be reproduced without our permission.',
        ],
      },
      {
        heading: 'Changes to these terms',
        body: [
          'We may update these terms from time to time as our business evolves. The "last updated" date at the top of this page reflects the most recent revision.',
        ],
      },
    ],
  },
}

export function getPolicyPage(slug: string): PolicyPage | undefined {
  return POLICY_PAGES[slug as PolicySlug]
}
