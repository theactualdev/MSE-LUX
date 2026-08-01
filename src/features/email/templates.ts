// Pure, DB-free transactional email templates. No React/JSX, no `server-only`, no new
// dependency — just plain template strings returning `{ subject, html }`. Email clients
// (Outlook chief among them) don't run a CSS engine: layout is table-based, every style is
// inlined, and there's no flexbox/grid or <style> block. Colors/fonts mirror the storefront's
// ivory/gold palette but as literal hex values (email clients can't read CSS custom properties).

import { formatMoney } from '@/lib/money'
import { absoluteUrl } from '@/lib/seo'
import { siteConfig } from '@/lib/config'
import type { Currency } from '@/types/money'

export interface OrderEmailData {
  orderNumber: string
  customerName: string // ship name (the order snapshot's)
  currency: string // the order's own currency
  lines: Array<{ name: string; variantLabel?: string; quantity: number; lineTotalMinor: number }>
  subtotalMinor: number
  shippingMinor: number
  taxMinor: number
  totalMinor: number
  shippingAddress: {
    line1: string
    line2?: string
    city: string
    state: string
    country: string
    postalCode?: string
  }
  // Phase 10c gift purchasing. A gift order's confirmation/shipped email goes
  // to the BUYER, not the recipient — see `recipientBlock` below for why
  // `giftRecipientName` (first name only) is the only piece of the
  // recipient's identity this module is allowed to show them.
  isGift: boolean
  giftRecipientName?: string
}

const INK = '#1c1917'
const IVORY = '#faf7f2'
const GOLD = '#b08d57'
const MUTED = '#78716c'
const FONT_STACK = "Georgia, 'Times New Roman', Times, serif"

/**
 * Escapes the five HTML-significant characters. `&` MUST run first — escaping it after the
 * others would double-escape the entities those replacements just introduced (e.g. `<` →
 * `&lt;` then `&` → `&amp;` would corrupt it into `&amp;lt;`). Every interpolated value in
 * this module — product names, variant labels, customer names, addresses — is admin/customer
 * authored and goes through this before landing in the HTML string.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** First token of a full name, for the email greeting (falls back to the whole string if there's no space). */
function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName
}

/**
 * The greeting name for the email's "Hi ___," line. For a GIFT order,
 * `data.customerName` (the order snapshot's `shipFullName`) is the
 * RECIPIENT's name, not the buyer's — the buyer is who this email actually
 * goes to (see `recipientBlock` below), and the order row holds no buyer
 * name to greet them with. A neutral "there" avoids calling the buyer by the
 * person they're sending a gift to. Non-gift orders are unaffected: their
 * `customerName` genuinely is the person receiving the email.
 */
function greetingName(data: OrderEmailData): string {
  return data.isGift ? 'there' : firstName(data.customerName)
}

function money(amountMinor: number, currency: Currency): string {
  return formatMoney({ amountMinor, currency })
}

/** Renders the order's line items as a table — one row per line, quantity and line total per row. */
function lineItemsTable(lines: OrderEmailData['lines'], currency: Currency): string {
  const rows = lines
    .map(
      (line) => `
        <tr>
          <td style="padding: 12px 0; border-bottom: 1px solid #e7e2d9; font-size: 14px; color: ${INK};">
            ${escapeHtml(line.name)}${line.variantLabel ? `<br /><span style="color: ${MUTED}; font-size: 12px;">${escapeHtml(line.variantLabel)}</span>` : ''}
          </td>
          <td style="padding: 12px 0; border-bottom: 1px solid #e7e2d9; font-size: 14px; color: ${MUTED}; text-align: center;">
            &times;${line.quantity}
          </td>
          <td style="padding: 12px 0; border-bottom: 1px solid #e7e2d9; font-size: 14px; color: ${INK}; text-align: right; white-space: nowrap;">
            ${escapeHtml(money(line.lineTotalMinor, currency))}
          </td>
        </tr>`
    )
    .join('')

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse;">
      ${rows}
    </table>`
}

function totalsTable(data: OrderEmailData, currency: Currency): string {
  const row = (label: string, amountMinor: number, bold = false) => `
    <tr>
      <td style="padding: 4px 0; font-size: ${bold ? '15px' : '13px'}; color: ${bold ? INK : MUTED}; font-weight: ${bold ? 'bold' : 'normal'};">${label}</td>
      <td style="padding: 4px 0; font-size: ${bold ? '15px' : '13px'}; color: ${bold ? INK : MUTED}; font-weight: ${bold ? 'bold' : 'normal'}; text-align: right;">${escapeHtml(money(amountMinor, currency))}</td>
    </tr>`

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse; margin-top: 12px;">
      ${row('Subtotal', data.subtotalMinor)}
      ${row('Shipping', data.shippingMinor)}
      ${row('Tax', data.taxMinor)}
      ${row('Total', data.totalMinor, true)}
    </table>`
}

function addressBlock(address: OrderEmailData['shippingAddress']): string {
  const lines = [address.line1, address.line2, `${address.city}, ${address.state}`, address.country].filter(
    (line): line is string => Boolean(line && line.trim().length > 0)
  )

  return `
    <p style="margin: 0; font-size: 13px; line-height: 1.6; color: ${MUTED};">
      ${lines.map((line) => escapeHtml(line)).join('<br />')}
    </p>`
}

/**
 * Buyer-facing recipient block. For a GIFT the buyer must never see where the
 * parcel is going beyond locality — this email goes to the person who paid,
 * not the person receiving. First name + city/state/country only: no street,
 * no line2, no postal code. (Phase 10c; without this the confirmation email
 * would disclose the recipient's home address to whoever bought the gift.)
 */
function recipientBlock(data: OrderEmailData): string {
  if (!data.isGift) return addressBlock(data.shippingAddress)
  const a = data.shippingAddress
  const parts = [data.giftRecipientName ?? 'Your recipient', `${a.city}, ${a.state}`, a.country]
  return `
    <p style="margin: 0; font-size: 13px; line-height: 1.6; color: ${MUTED};">
      ${parts.map((line) => escapeHtml(line)).join('<br />')}
    </p>`
}

/** A plain `<a>` styled as a button — email clients strip `<button>` and most JS, so this is the only reliable CTA. */
function button(href: string, label: string): string {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 24px 0;">
      <tr>
        <td style="background-color: ${GOLD}; border-radius: 4px;">
          <a href="${escapeHtml(href)}" style="display: inline-block; padding: 12px 28px; font-family: ${FONT_STACK}; font-size: 14px; font-weight: bold; color: ${IVORY}; text-decoration: none; letter-spacing: 0.02em;">
            ${escapeHtml(label)}
          </a>
        </td>
      </tr>
    </table>`
}

/** Shared document shell — ivory background, ink text, gold accent, serif stack. Wraps `bodyHtml` in the table-based structure every transactional email uses. */
function layout(bodyHtml: string, footerNote = 'This is a transactional email about your order.'): string {
  const brand = escapeHtml(siteConfig.name)

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${brand}</title>
  </head>
  <body style="margin: 0; padding: 0; background-color: ${IVORY}; font-family: ${FONT_STACK};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width: 100%; background-color: ${IVORY};">
      <tr>
        <td align="center" style="padding: 24px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width: 100%; max-width: 600px; background-color: #ffffff;">
            <tr>
              <td style="padding: 24px 24px 8px 24px; border-bottom: 2px solid ${GOLD};">
                <span style="font-family: ${FONT_STACK}; font-size: 20px; letter-spacing: 0.05em; color: ${INK};">${brand}</span>
              </td>
            </tr>
            <tr>
              <td style="padding: 24px;">
                ${bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="padding: 16px 24px; border-top: 1px solid #e7e2d9;">
                <span style="font-size: 11px; color: ${MUTED};">${brand} &middot; ${escapeHtml(footerNote)}</span>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

/** Order confirmation email, sent right after an order is placed. */
export function orderConfirmationEmail(data: OrderEmailData): { subject: string; html: string } {
  const currency = data.currency as Currency
  const orderNumber = escapeHtml(data.orderNumber)
  const orderUrl = absoluteUrl(`/order/${data.orderNumber}`)

  const body = `
    <p style="margin: 0 0 16px 0; font-size: 16px; color: ${INK};">Hi ${escapeHtml(greetingName(data))},</p>
    <p style="margin: 0 0 20px 0; font-size: 14px; line-height: 1.6; color: ${INK};">
      Thank you for your order. We're preparing it now and will email you again once it ships.
    </p>
    <p style="margin: 0 0 16px 0; font-size: 13px; color: ${MUTED};">Order <strong style="color: ${INK};">${orderNumber}</strong></p>
    ${lineItemsTable(data.lines, currency)}
    ${totalsTable(data, currency)}
    <p style="margin: 24px 0 4px 0; font-size: 13px; font-weight: bold; color: ${INK};">${data.isGift ? 'Gift for' : 'Shipping to'}</p>
    ${recipientBlock(data)}
    ${data.isGift ? '' : button(orderUrl, 'View your order')}
  `

  return {
    subject: `Order ${data.orderNumber} confirmed`,
    html: layout(body),
  }
}

/** Shipping notification email, sent once an order's tracking info is recorded. */
export function orderShippedEmail(
  data: OrderEmailData & { carrier: string; trackingNumber: string }
): { subject: string; html: string } {
  const currency = data.currency as Currency
  const orderNumber = escapeHtml(data.orderNumber)
  const orderUrl = absoluteUrl(`/order/${data.orderNumber}`)

  const body = `
    <p style="margin: 0 0 16px 0; font-size: 16px; color: ${INK};">Hi ${escapeHtml(greetingName(data))},</p>
    <p style="margin: 0 0 20px 0; font-size: 14px; line-height: 1.6; color: ${INK};">
      Your order is on its way.
    </p>
    <p style="margin: 0 0 16px 0; font-size: 13px; color: ${MUTED};">Order <strong style="color: ${INK};">${orderNumber}</strong></p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse; margin-bottom: 20px; background-color: ${IVORY}; border: 1px solid #e7e2d9;">
      <tr>
        <td style="padding: 16px;">
          <p style="margin: 0 0 6px 0; font-size: 11px; letter-spacing: 0.05em; text-transform: uppercase; color: ${MUTED};">Carrier</p>
          <p style="margin: 0 0 14px 0; font-size: 15px; font-weight: bold; color: ${INK};">${escapeHtml(data.carrier)}</p>
          <p style="margin: 0 0 6px 0; font-size: 11px; letter-spacing: 0.05em; text-transform: uppercase; color: ${MUTED};">Tracking number</p>
          <p style="margin: 0; font-size: 15px; font-weight: bold; color: ${INK};">${escapeHtml(data.trackingNumber)}</p>
        </td>
      </tr>
    </table>
    ${lineItemsTable(data.lines, currency)}
    ${totalsTable(data, currency)}
    <p style="margin: 24px 0 4px 0; font-size: 13px; font-weight: bold; color: ${INK};">${data.isGift ? 'Gift for' : 'Shipping to'}</p>
    ${recipientBlock(data)}
    ${data.isGift ? '' : button(orderUrl, 'View your order')}
  `

  return {
    subject: `Order ${data.orderNumber} shipped`,
    html: layout(body),
  }
}

/**
 * Double-opt-in confirmation for the footer newsletter form (Phase 10a).
 * Both URLs are app-built (`absoluteUrl` + a stored token) — escaped anyway,
 * per this module's rule that EVERY interpolation goes through escapeHtml.
 */
export function newsletterConfirmationEmail(input: { confirmUrl: string; unsubscribeUrl: string }): {
  subject: string
  html: string
} {
  const body = `
    <p style="margin: 0 0 16px 0; font-size: 16px; color: ${INK};">Welcome,</p>
    <p style="margin: 0 0 20px 0; font-size: 14px; line-height: 1.6; color: ${INK};">
      Confirm your email address to start receiving news from ${escapeHtml(siteConfig.name)} — new pieces, restocks, and the occasional offer.
    </p>
    ${button(input.confirmUrl, 'Confirm my subscription')}
    <p style="margin: 0 0 8px 0; font-size: 12px; line-height: 1.6; color: ${MUTED};">
      If the button doesn't work, copy and paste this link into your browser:
    </p>
    <p style="margin: 0 0 20px 0; font-size: 12px; line-height: 1.6; word-break: break-all;">
      <a href="${escapeHtml(input.confirmUrl)}" style="color: ${GOLD};">${escapeHtml(input.confirmUrl)}</a>
    </p>
    <p style="margin: 0; font-size: 12px; line-height: 1.6; color: ${MUTED};">
      If you didn't sign up, ignore this email — you won't be subscribed.
      Already confirmed and changed your mind?
      <a href="${escapeHtml(input.unsubscribeUrl)}" style="color: ${GOLD};">Unsubscribe</a>.
    </p>
  `

  return {
    subject: `Confirm your ${siteConfig.name} newsletter subscription`,
    html: layout(body, 'This email was sent because someone asked to subscribe this address to our newsletter.'),
  }
}
