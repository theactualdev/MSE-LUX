'use server'

import { Role, SubscriberStatus } from '@/generated/prisma/client'
import { getCurrentRole, roleSatisfies } from '@/features/auth/claims'
import { db } from '@/lib/db'

/**
 * CSV export as a Server Action rather than a route handler — DELIBERATE. A
 * handler under `app/api/` sits OUTSIDE the `(admin)` layout gate and would
 * ship as a new public endpoint needing its own guard; an action stays inside
 * the gate. It still re-checks ADMIN itself: actions are public HTTP
 * endpoints, and the layout gate covers rendering only.
 */

async function isAdmin(): Promise<boolean> {
  return roleSatisfies(await getCurrentRole(), Role.ADMIN)
}

/** RFC 4180 quoting: wrap in quotes, double embedded quotes. */
function csvField(value: string): string {
  return `"${value.replace(/"/g, '""')}"`
}

export async function exportConfirmedCsv(): Promise<
  { ok: true; csv: string; filename: string } | { ok: false; error: 'forbidden' }
> {
  if (!(await isAdmin())) return { ok: false, error: 'forbidden' }

  const rows = await db.subscriber.findMany({
    where: { status: SubscriberStatus.CONFIRMED },
    orderBy: { confirmedAt: 'asc' },
    select: { email: true, confirmedAt: true },
  })

  const lines = [
    ['email', 'confirmedAt'],
    ...rows.map((row) => [row.email, row.confirmedAt?.toISOString() ?? '']),
  ].map((fields) => fields.map(csvField).join(','))

  return {
    ok: true,
    csv: lines.join('\r\n'),
    filename: `subscribers-${new Date().toISOString().slice(0, 10)}.csv`,
  }
}
