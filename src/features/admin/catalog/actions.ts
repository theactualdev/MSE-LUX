'use server'

import { revalidatePath } from 'next/cache'
import { Role } from '@/generated/prisma/client'
import { getCurrentRole, roleSatisfies } from '@/features/auth/claims'
import {
  updateProduct,
  archiveProduct,
  restoreProduct,
  deleteProduct,
  type CatalogWriteResult,
} from '@/features/admin/catalog/products'
import {
  createCollection,
  updateCollection,
  deleteCollection,
} from '@/features/admin/catalog/collections'

/**
 * The admin-catalog Server Actions. SECURITY: actions are public HTTP endpoints
 * — the (admin) layout gate covers RENDERING only, so every action here
 * re-checks ADMIN itself before touching the engine. A typed 'forbidden'
 * result (rather than requireRole's redirect/notFound throw) keeps action
 * responses uniform for the client panels.
 */
async function isAdmin(): Promise<boolean> {
  return roleSatisfies(await getCurrentRole(), Role.ADMIN)
}

const FORBIDDEN = { ok: false as const, error: 'forbidden' as const }

function revalidateCatalogTargets(result: CatalogWriteResult): void {
  if (!result.ok) return
  for (const target of result.revalidate) {
    revalidatePath(target)
  }
  revalidatePath('/admin/catalog')
}

export async function updateProductAction(id: string, input: unknown) {
  if (!(await isAdmin())) return FORBIDDEN
  const result = await updateProduct(id, input)
  revalidateCatalogTargets(result)
  return result
}

export async function archiveProductAction(id: string) {
  if (!(await isAdmin())) return FORBIDDEN
  const result = await archiveProduct(id)
  revalidateCatalogTargets(result)
  return result
}

export async function restoreProductAction(id: string) {
  if (!(await isAdmin())) return FORBIDDEN
  const result = await restoreProduct(id)
  revalidateCatalogTargets(result)
  return result
}

export async function deleteProductAction(id: string) {
  if (!(await isAdmin())) return FORBIDDEN
  const result = await deleteProduct(id)
  revalidateCatalogTargets(result)
  return result
}

export async function createCollectionAction(input: unknown) {
  if (!(await isAdmin())) return FORBIDDEN
  const result = await createCollection(input)
  revalidateCatalogTargets(result)
  return result
}

export async function updateCollectionAction(id: string, input: unknown) {
  if (!(await isAdmin())) return FORBIDDEN
  const result = await updateCollection(id, input)
  revalidateCatalogTargets(result)
  return result
}

export async function deleteCollectionAction(id: string) {
  if (!(await isAdmin())) return FORBIDDEN
  const result = await deleteCollection(id)
  revalidateCatalogTargets(result)
  return result
}
