'use server'

import { revalidatePath } from 'next/cache'
import { Role } from '@/generated/prisma/client'
import { getCurrentRole, roleSatisfies } from '@/features/auth/claims'
import { shipOrder, deliverOrder, cancelOrder, markOrderRefunded } from '@/features/admin/orders/transitions'
import { getBookingRates, bookShipment, type BookShipmentInput } from '@/features/admin/orders/booking'

/**
 * The admin-order Server Actions. SECURITY: actions are public HTTP endpoints
 * — the (admin) layout gate covers RENDERING only, so every action here
 * re-checks ADMIN itself before touching the engine. A typed 'forbidden'
 * result (rather than requireRole's redirect/notFound throw) keeps action
 * responses uniform for the client panels.
 */
async function isAdmin(): Promise<boolean> {
  return roleSatisfies(await getCurrentRole(), Role.ADMIN)
}

const FORBIDDEN = { ok: false as const, error: 'forbidden' as const }

function revalidateOrder(orderNumber: string): void {
  revalidatePath('/admin/orders')
  revalidatePath(`/admin/orders/${orderNumber}`)
}

export async function shipOrderAction(orderNumber: string, input: { carrier: string; trackingNumber: string }) {
  if (!(await isAdmin())) return FORBIDDEN
  const result = await shipOrder(orderNumber, input)
  if (result.ok) revalidateOrder(orderNumber)
  return result
}

export async function deliverOrderAction(orderNumber: string) {
  if (!(await isAdmin())) return FORBIDDEN
  const result = await deliverOrder(orderNumber)
  if (result.ok) revalidateOrder(orderNumber)
  return result
}

export async function cancelOrderAction(orderNumber: string) {
  if (!(await isAdmin())) return FORBIDDEN
  const result = await cancelOrder(orderNumber)
  if (result.ok) revalidateOrder(orderNumber)
  return result
}

export async function markOrderRefundedAction(orderNumber: string, input: { reference?: string }) {
  if (!(await isAdmin())) return FORBIDDEN
  const result = await markOrderRefunded(orderNumber, input)
  if (result.ok) revalidateOrder(orderNumber)
  return result
}

export async function getBookingRatesAction(orderNumber: string) {
  if (!(await isAdmin())) return FORBIDDEN
  return await getBookingRates(orderNumber)
}

export async function bookShipmentAction(orderNumber: string, input: BookShipmentInput) {
  if (!(await isAdmin())) return FORBIDDEN
  const result = await bookShipment(orderNumber, input)
  if (result.ok) revalidateOrder(orderNumber)
  return result
}
