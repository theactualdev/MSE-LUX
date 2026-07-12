import type { Money } from '@/types/money'

export interface ShippingRate {
  serviceCode: string
  label: string
  amount: Money
  estimatedDays?: number
}
export interface ShipmentInput {
  orderRef: string
  serviceCode: string
}
export interface Shipment {
  providerRef: string
  trackingNumber: string
  status: string
}
export interface ShippingProvider {
  readonly name: string
  getRates(destinationCountry: string): Promise<ShippingRate[]>
  createShipment(input: ShipmentInput): Promise<Shipment>
  track(trackingNumber: string): Promise<{ status: string }>
}
