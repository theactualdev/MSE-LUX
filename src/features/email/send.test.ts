import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * `sendOrderConfirmation`/`sendOrderShipped` are the ONLY two email entry
 * points fulfilment code calls, and both take just an `orderNumber` — they
 * load and map the order themselves, so the fulfilment call sites stay
 * trivial. Per `client.ts`'s contract, `sendEmail` never throws; per THIS
 * module's own contract, neither sender ever throws or returns a value the
 * caller must handle — every branch (not-found, `sendEmail` failure, an
 * unexpected `db` throw) is swallowed and logged, and every test below
 * asserts that by awaiting to completion, not by expecting a rejection.
 */

const order = {
  findUnique: vi.fn(),
}

vi.mock('@/lib/db', () => ({
  db: {
    get order() {
      return order
    },
  },
}))

const sendEmailMock = vi.fn()
vi.mock('./client', () => ({
  sendEmail: (...args: unknown[]) => sendEmailMock(...args),
}))

const orderConfirmationEmailMock = vi.fn()
const orderShippedEmailMock = vi.fn()
const newsletterConfirmationEmailMock = vi.fn()
vi.mock('./templates', () => ({
  orderConfirmationEmail: (...args: unknown[]) => orderConfirmationEmailMock(...args),
  orderShippedEmail: (...args: unknown[]) => orderShippedEmailMock(...args),
  newsletterConfirmationEmail: (...args: unknown[]) => newsletterConfirmationEmailMock(...args),
}))

const { sendOrderConfirmation, sendOrderShipped, sendNewsletterConfirmation } = await import('@/features/email/send')

const ORDER_NUMBER = 'MSE-000123'
const EMAIL = 'buyer@example.com'

const CONFIRMATION_TEMPLATE = { subject: 'Order MSE-000123 confirmed', html: '<p>confirmed</p>' }
const SHIPPED_TEMPLATE = { subject: 'Order MSE-000123 shipped', html: '<p>shipped</p>' }

function baseOrder(overrides: Record<string, unknown> = {}) {
  return {
    orderNumber: ORDER_NUMBER,
    email: EMAIL,
    currency: 'NGN',
    subtotalMinor: 40_000,
    shippingMinor: 5_000,
    taxMinor: 3_000,
    totalMinor: 48_000,
    shipFullName: 'Ada Lovelace',
    shipLine1: '1 Analytical Engine Way',
    shipLine2: 'Suite 2',
    shipCity: 'Lagos',
    shipState: 'Lagos',
    shipCountry: 'NG',
    trackingCarrier: 'GIG',
    trackingNumber: 'TRK-1',
    lines: [
      { productName: 'Gold Ring', variantLabel: 'Size 7', quantity: 1, lineTotalMinor: 25_000 },
      { productName: 'Silver Chain', variantLabel: null, quantity: 2, lineTotalMinor: 15_000 },
    ],
    ...overrides,
  }
}

const EXPECTED_EMAIL_DATA = {
  orderNumber: ORDER_NUMBER,
  customerName: 'Ada Lovelace',
  currency: 'NGN',
  lines: [
    { name: 'Gold Ring', variantLabel: 'Size 7', quantity: 1, lineTotalMinor: 25_000 },
    { name: 'Silver Chain', variantLabel: undefined, quantity: 2, lineTotalMinor: 15_000 },
  ],
  subtotalMinor: 40_000,
  shippingMinor: 5_000,
  taxMinor: 3_000,
  totalMinor: 48_000,
  shippingAddress: {
    line1: '1 Analytical Engine Way',
    line2: 'Suite 2',
    city: 'Lagos',
    state: 'Lagos',
    country: 'NG',
  },
}

describe('sendOrderConfirmation', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    orderConfirmationEmailMock.mockReturnValue(CONFIRMATION_TEMPLATE)
    sendEmailMock.mockResolvedValue({ ok: true, id: 'email_1' })
  })

  afterEach(() => {
    consoleErrorSpy.mockRestore()
  })

  it('loads the order, maps it to OrderEmailData exactly, and sends the confirmation template', async () => {
    order.findUnique.mockResolvedValue(baseOrder())

    await sendOrderConfirmation(ORDER_NUMBER)

    expect(order.findUnique).toHaveBeenCalledWith({ where: { orderNumber: ORDER_NUMBER }, include: { lines: true } })
    expect(orderConfirmationEmailMock).toHaveBeenCalledWith(EXPECTED_EMAIL_DATA)
    expect(sendEmailMock).toHaveBeenCalledWith({
      to: EMAIL,
      subject: CONFIRMATION_TEMPLATE.subject,
      html: CONFIRMATION_TEMPLATE.html,
    })
  })

  it('logs and does not send when the order cannot be found', async () => {
    order.findUnique.mockResolvedValue(null)

    await sendOrderConfirmation(ORDER_NUMBER)

    expect(sendEmailMock).not.toHaveBeenCalled()
    expect(orderConfirmationEmailMock).not.toHaveBeenCalled()
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1)
    expect(consoleErrorSpy.mock.calls[0][0]).toContain('[sendOrderConfirmation]')
  })

  it('logs (does not throw) when sendEmail resolves with a failure', async () => {
    order.findUnique.mockResolvedValue(baseOrder())
    sendEmailMock.mockResolvedValue({ ok: false, error: 'send-failed' })

    await expect(sendOrderConfirmation(ORDER_NUMBER)).resolves.toBeUndefined()

    expect(consoleErrorSpy).toHaveBeenCalledTimes(1)
    expect(consoleErrorSpy.mock.calls[0][0]).toContain('[sendOrderConfirmation]')
  })

  it('never throws — resolves normally (logged) when the db throws', async () => {
    order.findUnique.mockRejectedValue(new Error('connection reset'))

    await expect(sendOrderConfirmation(ORDER_NUMBER)).resolves.toBeUndefined()

    expect(sendEmailMock).not.toHaveBeenCalled()
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1)
    expect(consoleErrorSpy.mock.calls[0][0]).toContain('[sendOrderConfirmation]')
  })
})

describe('sendOrderShipped', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    orderShippedEmailMock.mockReturnValue(SHIPPED_TEMPLATE)
    sendEmailMock.mockResolvedValue({ ok: true, id: 'email_2' })
  })

  afterEach(() => {
    consoleErrorSpy.mockRestore()
  })

  it('loads the order, maps it (plus carrier/trackingNumber), and sends the shipped template', async () => {
    order.findUnique.mockResolvedValue(baseOrder())

    await sendOrderShipped(ORDER_NUMBER)

    expect(order.findUnique).toHaveBeenCalledWith({ where: { orderNumber: ORDER_NUMBER }, include: { lines: true } })
    expect(orderShippedEmailMock).toHaveBeenCalledWith({
      ...EXPECTED_EMAIL_DATA,
      carrier: 'GIG',
      trackingNumber: 'TRK-1',
    })
    expect(sendEmailMock).toHaveBeenCalledWith({
      to: EMAIL,
      subject: SHIPPED_TEMPLATE.subject,
      html: SHIPPED_TEMPLATE.html,
    })
  })

  it('logs and does not send when the order cannot be found', async () => {
    order.findUnique.mockResolvedValue(null)

    await sendOrderShipped(ORDER_NUMBER)

    expect(sendEmailMock).not.toHaveBeenCalled()
    expect(orderShippedEmailMock).not.toHaveBeenCalled()
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1)
    expect(consoleErrorSpy.mock.calls[0][0]).toContain('[sendOrderShipped]')
  })

  it('logs and does NOT send when trackingCarrier is missing', async () => {
    order.findUnique.mockResolvedValue(baseOrder({ trackingCarrier: null }))

    await sendOrderShipped(ORDER_NUMBER)

    expect(sendEmailMock).not.toHaveBeenCalled()
    expect(orderShippedEmailMock).not.toHaveBeenCalled()
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1)
    expect(consoleErrorSpy.mock.calls[0][0]).toContain('[sendOrderShipped]')
  })

  it('logs and does NOT send when trackingNumber is missing', async () => {
    order.findUnique.mockResolvedValue(baseOrder({ trackingNumber: null }))

    await sendOrderShipped(ORDER_NUMBER)

    expect(sendEmailMock).not.toHaveBeenCalled()
    expect(orderShippedEmailMock).not.toHaveBeenCalled()
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1)
    expect(consoleErrorSpy.mock.calls[0][0]).toContain('[sendOrderShipped]')
  })

  it('logs (does not throw) when sendEmail resolves with a failure', async () => {
    order.findUnique.mockResolvedValue(baseOrder())
    sendEmailMock.mockResolvedValue({ ok: false, error: 'send-failed' })

    await expect(sendOrderShipped(ORDER_NUMBER)).resolves.toBeUndefined()

    expect(consoleErrorSpy).toHaveBeenCalledTimes(1)
    expect(consoleErrorSpy.mock.calls[0][0]).toContain('[sendOrderShipped]')
  })

  it('never throws — resolves normally (logged) when the db throws', async () => {
    order.findUnique.mockRejectedValue(new Error('connection reset'))

    await expect(sendOrderShipped(ORDER_NUMBER)).resolves.toBeUndefined()

    expect(sendEmailMock).not.toHaveBeenCalled()
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1)
    expect(consoleErrorSpy.mock.calls[0][0]).toContain('[sendOrderShipped]')
  })
})

describe('sendNewsletterConfirmation', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    newsletterConfirmationEmailMock.mockImplementation((input: { confirmUrl: string; unsubscribeUrl: string }) => ({
      subject: 'Confirm subscription',
      html: `<p>Confirm: ${input.confirmUrl}, Unsubscribe: ${input.unsubscribeUrl}</p>`,
    }))
    sendEmailMock.mockResolvedValue({ ok: true, id: 'em_1' })
  })

  afterEach(() => {
    consoleErrorSpy.mockRestore()
  })

  it('sends one email to the subscriber with token-bearing links', async () => {
    sendEmailMock.mockResolvedValue({ ok: true, id: 'em_1' })
    await sendNewsletterConfirmation({ email: 'ada@example.com', token: 'tok123' })
    expect(sendEmailMock).toHaveBeenCalledTimes(1)
    const arg = sendEmailMock.mock.calls[0][0]
    expect(arg.to).toBe('ada@example.com')
    expect(arg.html).toContain('/newsletter/confirm?token=tok123')
    expect(arg.html).toContain('/newsletter/unsubscribe?token=tok123')
  })

  it('never throws when the client reports failure', async () => {
    sendEmailMock.mockResolvedValue({ ok: false, error: 'not-configured' })
    await expect(sendNewsletterConfirmation({ email: 'a@b.com', token: 't' })).resolves.toBeUndefined()
  })

  it('never throws when the client itself rejects unexpectedly', async () => {
    sendEmailMock.mockRejectedValue(new Error('boom'))
    await expect(sendNewsletterConfirmation({ email: 'a@b.com', token: 't' })).resolves.toBeUndefined()
  })
})
