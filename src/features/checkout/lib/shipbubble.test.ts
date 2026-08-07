import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const API_KEY = 'sb_test_xxx'

beforeEach(() => {
  process.env.SHIPBUBBLE_API_KEY = API_KEY
})

afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.SHIPBUBBLE_API_KEY
})

const { validateAddress, fetchRates, createLabel } = await import('@/features/checkout/lib/shipbubble')

describe('validateAddress', () => {
  it('POSTs to /shipping/address/validate with the Bearer header and the name/email/phone/address body, and returns data.address_code as a string', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: true,
        data: { address_code: 12345, formatted_address: '1 Ajose Adeogun St, Lagos, NG' },
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await validateAddress({
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      phone: '+2348012345678',
      address: '1 Ajose Adeogun St, Victoria Island, Lagos',
    })

    expect(result).toEqual({ addressCode: '12345' })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.shipbubble.com/v1/shipping/address/validate')
    expect(init.method).toBe('POST')
    expect(init.headers).toMatchObject({
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    })
    expect(JSON.parse(init.body)).toEqual({
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      phone: '+2348012345678',
      address: '1 Ajose Adeogun St, Victoria Island, Lagos',
    })
  })

  it('returns the address_code as a string when ShipBubble returns it as a string already', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ status: true, data: { address_code: 'abc-123' } }),
      }),
    )

    const result = await validateAddress({
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      phone: '+2348012345678',
      address: '1 Ajose Adeogun St, Victoria Island, Lagos',
    })

    expect(result).toEqual({ addressCode: 'abc-123' })
  })

  it('throws when the response is status:false', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ status: false, message: 'Unable to validate address' }),
      }),
    )

    await expect(
      validateAddress({ name: 'Ada', email: 'ada@example.com', phone: '+234', address: 'nowhere' }),
    ).rejects.toThrow()
  })

  /**
   * REGRESSION: the live API's success envelope is the STRING 'success', not
   * the documented boolean. Every test above mocks `status: true`, which is why
   * a `status !== true` check passed CI while rejecting every real 200. This
   * body is copied from an actual 2026-07-28 response.
   */
  it("accepts the live envelope: status is the string 'success', not boolean true", async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: 'success',
          message: 'Validation successful',
          data: { address_code: 432787751, formatted_address: '25 Eletu Odibo St, Lagos, Nigeria' },
        }),
      }),
    )

    const result = await validateAddress({
      name: 'MSE Lux',
      email: 'info@mselux.com',
      phone: '+2349154122133',
      address: '25 Eletu Odibo Street, Yaba, Lagos, Nigeria',
    })

    expect(result).toEqual({ addressCode: '432787751' })
  })

  it('still rejects an unrecognised status string', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ status: 'error', message: 'Unable to validate address', data: { address_code: 1 } }),
      }),
    )

    await expect(
      validateAddress({ name: 'Ada', email: 'ada@example.com', phone: '+234', address: 'nowhere' }),
    ).rejects.toThrow()
  })

  it('throws when the response is a non-2xx', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }))

    await expect(
      validateAddress({ name: 'Ada', email: 'ada@example.com', phone: '+234', address: 'nowhere' }),
    ).rejects.toThrow()
  })

  it('throws when SHIPBUBBLE_API_KEY is not set', async () => {
    delete process.env.SHIPBUBBLE_API_KEY
    vi.stubGlobal('fetch', vi.fn())

    await expect(
      validateAddress({ name: 'Ada', email: 'ada@example.com', phone: '+234', address: 'nowhere' }),
    ).rejects.toThrow('SHIPBUBBLE_API_KEY is not set')
  })
})

describe('fetchRates', () => {
  const baseInput = {
    senderAddressCode: 'sender-1',
    receiverAddressCode: 'receiver-1',
    packageItems: [{ name: 'Ring', description: 'Gold ring', unitWeightGrams: 450, unitAmountMinor: 50_000, quantity: 1 }],
    packageDimension: { length: 20, width: 15, height: 8 },
    pickupDate: '2026-07-26',
  }

  it('POSTs to /shipping/fetch_rates with sender/reciever address codes, package_items, package_dimension, category_id, and maps data.couriers to ShipBubbleRate[]', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: true,
        data: {
          request_token: 'req_tok_1',
          couriers: [
            {
              courier_id: 'courier_1',
              courier_name: 'GIG Logistics',
              service_code: 'gig_standard',
              total: 2_500,
              currency: 'NGN',
              delivery_eta: '2-3 days',
            },
            {
              courier_id: 'courier_2',
              courier_name: 'DHL',
              service_code: 'dhl_express',
              total: 5_000,
              currency: 'NGN',
              delivery_eta_time: '1 day',
            },
          ],
        },
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await fetchRates(baseInput)

    expect(result.requestToken).toBe('req_tok_1')
    expect(result.rates).toEqual([
      {
        courierId: 'courier_1',
        serviceCode: 'gig_standard',
        label: 'GIG Logistics',
        amountMinor: 250_000, // ₦2,500.00 major -> kobo
        currency: 'NGN',
        deliveryEta: '2-3 days',
      },
      {
        courierId: 'courier_2',
        serviceCode: 'dhl_express',
        label: 'DHL',
        amountMinor: 500_000, // ₦5,000.00 major -> kobo
        currency: 'NGN',
        deliveryEta: '1 day',
      },
    ])

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.shipbubble.com/v1/shipping/fetch_rates')
    expect(init.method).toBe('POST')
    expect(init.headers).toMatchObject({
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    })
    // ShipBubble is sent KILOGRAMS (`unit_weight`) and NAIRA (`unit_amount`),
    // never the caller's grams and kobo — and neither app-side field may leak
    // into the request body.
    //
    // The declared value matters as much as the weight: sending kobo made a
    // ₦60,000 bracelet declare as ₦6,000,000, and international couriers
    // price insurance on it — a live 73% overcharge that domestic rates hid,
    // because Nigerian pricing ignores declared value entirely.
    expect(JSON.parse(init.body)).toEqual({
      sender_address_code: 'sender-1',
      reciever_address_code: 'receiver-1',
      pickup_date: '2026-07-26',
      category_id: 0,
      package_items: [{ name: 'Ring', description: 'Gold ring', unit_weight: 0.45, unit_amount: 500, quantity: 1 }],
      package_dimension: baseInput.packageDimension,
    })
  })

  it('returns an empty rates array (with the request token) when data.couriers is missing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ status: true, data: { request_token: 'req_tok_1' } }),
      }),
    )

    const result = await fetchRates(baseInput)
    expect(result).toEqual({ requestToken: 'req_tok_1', rates: [] })
  })

  /** Same regression as validateAddress: the live envelope is the string 'success'. */
  it("accepts the live envelope: status is the string 'success'", async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: 'success',
          data: { request_token: 'req_tok_1', couriers: [] },
        }),
      }),
    )

    await expect(fetchRates(baseInput)).resolves.toEqual({ requestToken: 'req_tok_1', rates: [] })
  })

  /**
   * REGRESSION: `courier.total` is MAJOR units (naira). A live 2026-07-28
   * response for a 450g Yaba -> Victoria Island parcel returned fractional
   * totals (403.1, 464.34, 505.5) — a minor unit cannot be fractional, which
   * is what proves the unit. The old mapping assigned `total` straight to
   * `amountMinor`, undercharging 100x and putting a non-integer into a field
   * the money model requires to be whole kobo.
   */
  it('converts a fractional naira total to whole kobo', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: 'success',
          data: {
            request_token: 'req_tok_1',
            couriers: [
              { courier_id: 'c1', courier_name: 'Bubble Express', service_code: 's1', total: 403.1, currency: 'NGN' },
              { courier_id: 'c2', courier_name: 'Millie Express', service_code: 's2', total: 464.34, currency: 'NGN' },
            ],
          },
        }),
      }),
    )

    const { rates } = await fetchRates(baseInput)

    expect(rates.map((r) => r.amountMinor)).toEqual([40_310, 46_434])
    for (const r of rates) expect(Number.isInteger(r.amountMinor)).toBe(true)
  })

  it('throws when a status:true response is missing request_token (booking off it would be impossible)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ status: true, data: { couriers: [] } }),
      }),
    )

    await expect(fetchRates(baseInput)).rejects.toThrow('ShipBubble fetch rates returned no request_token')
  })

  it('throws when the response is status:false', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ status: false, message: 'Invalid address codes' }),
      }),
    )

    await expect(fetchRates(baseInput)).rejects.toThrow()
  })

  it('throws when the response is a non-2xx', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }))

    await expect(fetchRates(baseInput)).rejects.toThrow()
  })

  it('throws when SHIPBUBBLE_API_KEY is not set', async () => {
    delete process.env.SHIPBUBBLE_API_KEY
    vi.stubGlobal('fetch', vi.fn())

    await expect(fetchRates(baseInput)).rejects.toThrow('SHIPBUBBLE_API_KEY is not set')
  })
})

describe('createLabel', () => {
  const baseInput = { requestToken: 'req_tok_1', courierId: 'courier_1', serviceCode: 'gig_std' }

  it('POSTs /shipping/labels with request_token + service_code + courier_id and maps the response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: true, data: { order_id: 'SB-ORD-1', tracking_number: 'TRK-99', tracking_url: 'https://track/TRK-99', courier: { name: 'GIG Logistics' } } }),
    } as Response)
    vi.stubGlobal('fetch', fetchMock)

    const result = await createLabel({ requestToken: 'req_tok_1', courierId: 'courier_1', serviceCode: 'gig_std' })

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.shipbubble.com/v1/shipping/labels')
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ request_token: 'req_tok_1', service_code: 'gig_std', courier_id: 'courier_1' })
    expect(result).toEqual({ shipbubbleOrderId: 'SB-ORD-1', trackingNumber: 'TRK-99', trackingUrl: 'https://track/TRK-99', courierName: 'GIG Logistics' })
  })

  /** Same regression as validateAddress: the live envelope is the string 'success'. */
  it("accepts the live envelope: status is the string 'success'", async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: 'success',
          data: { order_id: 'SB-ORD-1', tracking_number: 'TRK-99', courier: { name: 'GIG Logistics' } },
        }),
      }),
    )

    await expect(createLabel(baseInput)).resolves.toMatchObject({ shipbubbleOrderId: 'SB-ORD-1', trackingNumber: 'TRK-99' })
  })

  it('throws on status:false and on a missing tracking number', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ status: false, message: 'Invalid request token' }),
      }),
    )
    await expect(createLabel(baseInput)).rejects.toThrow()

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ status: true, data: { order_id: 'SB-ORD-1', courier: { name: 'GIG Logistics' } } }),
      }),
    )
    await expect(createLabel(baseInput)).rejects.toThrow()
  })

  it('throws when the response is a non-2xx', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }))

    await expect(createLabel(baseInput)).rejects.toThrow()
  })

  it('throws when SHIPBUBBLE_API_KEY is not set', async () => {
    delete process.env.SHIPBUBBLE_API_KEY
    vi.stubGlobal('fetch', vi.fn())

    await expect(createLabel(baseInput)).rejects.toThrow('SHIPBUBBLE_API_KEY is not set')
  })
})
