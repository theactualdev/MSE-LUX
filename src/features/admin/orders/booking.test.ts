import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Same mocking idiom as `shipping.test.ts`: `db`, the ShipBubble REST wrapper,
 * and the tunable config are all mocked; `shipping-config`'s
 * `SHIPBUBBLE_ORIGIN_ADDRESS_CODE` is a mutable double (via `vi.hoisted`) so a
 * single test can flip it to `''` to exercise the "not configured" branch.
 * `transitions.ts`'s `shipOrder` is mocked too — booking's own tests aren't
 * responsible for re-verifying the state machine, only that booking calls it
 * correctly and threads its result through.
 */

const order = { findUnique: vi.fn() }
vi.mock('@/lib/db', () => ({
  db: {
    get order() {
      return order
    },
  },
}))

const validateAddress = vi.fn()
const fetchRates = vi.fn()
const createLabel = vi.fn()
vi.mock('@/features/checkout/lib/shipbubble', () => ({
  validateAddress: (...args: [unknown]) => validateAddress(...args),
  fetchRates: (...args: [unknown]) => fetchRates(...args),
  createLabel: (...args: [unknown]) => createLabel(...args),
}))

const shipOrder = vi.fn()
vi.mock('@/features/admin/orders/transitions', () => ({
  shipOrder: (...args: [string, unknown]) => shipOrder(...args),
}))

const configState = vi.hoisted(() => ({ originAddressCode: 'origin-abc' }))
vi.mock('@/features/checkout/lib/shipping-config', () => ({
  get SHIPBUBBLE_ORIGIN_ADDRESS_CODE() {
    return configState.originAddressCode
  },
  WEIGHT_BASE_GRAMS: 300,
  WEIGHT_PER_ITEM_GRAMS: 150,
  NOMINAL_DIMENSION: { length: 20, width: 15, height: 8 },
}))

const { getBookingRates, bookShipment } = await import('@/features/admin/orders/booking')

beforeEach(() => {
  configState.originAddressCode = 'origin-abc'
  vi.clearAllMocks()
})

const ORDER_NUMBER = 'MSE-000123'

const BASE_ORDER = {
  status: 'PROCESSING',
  email: 'buyer@example.com',
  subtotalMinor: 500_000,
  shippingMinor: 250_000,
  currency: 'NGN',
  shippingLabel: 'Standard delivery',
  shipFullName: 'Ada Lovelace',
  shipPhone: '+2348012345678',
  shipLine1: '12 Adeola Odeku Street',
  shipCity: 'Victoria Island',
  shipState: 'Lagos',
  shipCountry: 'Nigeria',
  lines: [{ quantity: 2 }, { quantity: 3 }],
}

const RATES = [
  { courierId: 'c-1', serviceCode: 'svc-1', label: 'GIG Logistics', amountMinor: 180_000, currency: 'NGN' },
  { courierId: 'c-2', serviceCode: 'svc-2', label: 'DHL', amountMinor: 320_000, currency: 'NGN' },
]

describe('getBookingRates', () => {
  it('happy path: PROCESSING Nigerian order re-quotes the snapshot address and returns rates + paidShipping', async () => {
    order.findUnique.mockResolvedValue(BASE_ORDER)
    validateAddress.mockResolvedValue({ addressCode: 'recv-1' })
    fetchRates.mockResolvedValue({ requestToken: 'tok-1', rates: RATES })

    const result = await getBookingRates(ORDER_NUMBER)

    expect(result).toEqual({
      ok: true,
      requestToken: 'tok-1',
      rates: RATES,
      paidShipping: { amountMinor: 250_000, currency: 'NGN', label: 'Standard delivery' },
    })

    expect(order.findUnique).toHaveBeenCalledWith({
      where: { orderNumber: ORDER_NUMBER },
      select: {
        status: true,
        email: true,
        subtotalMinor: true,
        shippingMinor: true,
        currency: true,
        shippingLabel: true,
        shipFullName: true,
        shipPhone: true,
        shipLine1: true,
        shipCity: true,
        shipState: true,
        shipCountry: true,
        lines: { select: { quantity: true } },
      },
    })

    expect(validateAddress).toHaveBeenCalledWith({
      name: 'Ada Lovelace',
      email: 'buyer@example.com',
      phone: '+2348012345678',
      address: '12 Adeola Odeku Street, Victoria Island, Lagos, Nigeria',
    })

    expect(fetchRates).toHaveBeenCalledTimes(1)
    const [ratesInput] = fetchRates.mock.calls[0]
    expect(ratesInput).toMatchObject({
      senderAddressCode: 'origin-abc',
      receiverAddressCode: 'recv-1',
      packageItems: [
        {
          name: 'MSE Lux order',
          description: 'Jewelry order',
          unit_weight: 300 + 150 * 5,
          unit_amount: 500_000,
          quantity: 1,
        },
      ],
      packageDimension: { length: 20, width: 15, height: 8 },
    })
    expect(ratesInput.pickupDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('returns not-found for an unknown order and never throws', async () => {
    order.findUnique.mockResolvedValue(null)

    const result = await getBookingRates(ORDER_NUMBER)

    expect(result).toEqual({ ok: false, error: 'not-found' })
    expect(validateAddress).not.toHaveBeenCalled()
    expect(fetchRates).not.toHaveBeenCalled()
  })

  it('returns invalid-state for a non-PROCESSING order', async () => {
    order.findUnique.mockResolvedValue({ ...BASE_ORDER, status: 'PENDING' })

    const result = await getBookingRates(ORDER_NUMBER)

    expect(result).toEqual({ ok: false, error: 'invalid-state' })
    expect(validateAddress).not.toHaveBeenCalled()
  })

  it('returns not-nigeria for a non-Nigerian snapshot address', async () => {
    order.findUnique.mockResolvedValue({ ...BASE_ORDER, shipCountry: 'United States' })

    const result = await getBookingRates(ORDER_NUMBER)

    expect(result).toEqual({ ok: false, error: 'not-nigeria' })
    expect(validateAddress).not.toHaveBeenCalled()
  })

  it('returns shipbubble-error (never throws) when validateAddress throws', async () => {
    order.findUnique.mockResolvedValue(BASE_ORDER)
    validateAddress.mockRejectedValue(new Error('boom'))

    const result = await getBookingRates(ORDER_NUMBER)

    expect(result).toEqual({ ok: false, error: 'shipbubble-error' })
    expect(fetchRates).not.toHaveBeenCalled()
  })

  it('returns shipbubble-error (never throws) when fetchRates throws', async () => {
    order.findUnique.mockResolvedValue(BASE_ORDER)
    validateAddress.mockResolvedValue({ addressCode: 'recv-1' })
    fetchRates.mockRejectedValue(new Error('boom'))

    const result = await getBookingRates(ORDER_NUMBER)

    expect(result).toEqual({ ok: false, error: 'shipbubble-error' })
  })

  it('returns shipbubble-error with no ShipBubble call when the origin address code is blank', async () => {
    configState.originAddressCode = ''
    order.findUnique.mockResolvedValue(BASE_ORDER)

    const result = await getBookingRates(ORDER_NUMBER)

    expect(result).toEqual({ ok: false, error: 'shipbubble-error' })
    expect(validateAddress).not.toHaveBeenCalled()
    expect(fetchRates).not.toHaveBeenCalled()
  })
})

describe('bookShipment', () => {
  const BOOK_INPUT = { requestToken: 'tok-1', courierId: 'c-1', serviceCode: 'svc-1' }

  const LABEL = {
    shipbubbleOrderId: 'SB-ORD-1',
    trackingNumber: 'TRK-1',
    trackingUrl: 'https://track.example.com/TRK-1',
    courierName: 'GIG Logistics',
  }

  it('happy path: books the label then ships the order', async () => {
    createLabel.mockResolvedValue(LABEL)
    shipOrder.mockResolvedValue({ ok: true })

    const result = await bookShipment(ORDER_NUMBER, BOOK_INPUT)

    expect(result).toEqual({ ok: true })
    expect(createLabel).toHaveBeenCalledWith({ requestToken: 'tok-1', courierId: 'c-1', serviceCode: 'svc-1' })
    expect(shipOrder).toHaveBeenCalledWith(ORDER_NUMBER, {
      carrier: 'GIG Logistics',
      trackingNumber: 'TRK-1',
      shipbubbleOrderId: 'SB-ORD-1',
    })
  })

  it.each([
    ['requestToken', { ...BOOK_INPUT, requestToken: '   ' }],
    ['courierId', { ...BOOK_INPUT, courierId: '' }],
    ['serviceCode', { ...BOOK_INPUT, serviceCode: '  ' }],
  ])('rejects a blank %s with NO createLabel call', async (_field, input) => {
    const result = await bookShipment(ORDER_NUMBER, input)

    expect(result).toEqual({ ok: false, error: 'invalid-input' })
    expect(createLabel).not.toHaveBeenCalled()
    expect(shipOrder).not.toHaveBeenCalled()
  })

  it('returns shipbubble-error (never throws) when createLabel throws, with NO shipOrder call', async () => {
    createLabel.mockRejectedValue(new Error('boom'))

    const result = await bookShipment(ORDER_NUMBER, BOOK_INPUT)

    expect(result).toEqual({ ok: false, error: 'shipbubble-error' })
    expect(shipOrder).not.toHaveBeenCalled()
  })

  it('label-booked-but-transition-lost: threads shipbubbleOrderId into a non-ok shipOrder result', async () => {
    createLabel.mockResolvedValue(LABEL)
    shipOrder.mockResolvedValue({ ok: false, error: 'conflict' })

    const result = await bookShipment(ORDER_NUMBER, BOOK_INPUT)

    expect(result).toEqual({ ok: false, error: 'conflict', shipbubbleOrderId: 'SB-ORD-1' })
  })
})
