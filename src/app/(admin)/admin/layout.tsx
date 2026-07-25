import { Role } from '@/generated/prisma/client'
import { requireRole } from '@/features/auth/guards'
import { getCurrentUserEmail } from '@/features/auth/claims'
import { AdminShell } from '@/features/admin/components/admin-shell'

/**
 * THE admin gate. Every /admin route nests under this layout, so
 * requireRole(ADMIN) runs before any admin page or data reader —
 * unauthenticated → redirect('/login'); insufficient role → notFound(),
 * caught by (admin)/not-found.tsx (a 404, indistinguishable from a route
 * that never existed). Admin data readers (features/admin/data.ts) assume
 * this gate ran; none of them re-check.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireRole(Role.ADMIN)
  const email = await getCurrentUserEmail()

  return <AdminShell email={email}>{children}</AdminShell>
}
