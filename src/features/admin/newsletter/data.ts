import 'server-only'

import { db } from '@/lib/db'
import { SubscriberStatus } from '@/generated/prisma/client'
import type { Prisma } from '@/generated/prisma/client'

/** Admin newsletter reads. Mirrors `admin/customers/data.ts`'s idioms. */

export const PAGE_SIZE = 50

export interface SubscriberRow {
  id: string
  email: string
  status: SubscriberStatus
  confirmedAt: Date | null
  createdAt: Date
}

export async function listSubscribers(input: {
  status?: SubscriberStatus
  search?: string
  page?: number
}): Promise<{
  subscribers: SubscriberRow[]
  total: number
  pageCount: number
  counts: { pending: number; confirmed: number; unsubscribed: number }
}> {
  const page = Math.max(1, input.page ?? 1)
  const where: Prisma.SubscriberWhereInput = {
    ...(input.status ? { status: input.status } : {}),
    ...(input.search ? { email: { contains: input.search, mode: 'insensitive' } } : {}),
  }

  const [subscribers, total, pending, confirmed, unsubscribed] = await Promise.all([
    db.subscriber.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: { id: true, email: true, status: true, confirmedAt: true, createdAt: true },
    }),
    db.subscriber.count({ where }),
    db.subscriber.count({ where: { status: SubscriberStatus.PENDING } }),
    db.subscriber.count({ where: { status: SubscriberStatus.CONFIRMED } }),
    db.subscriber.count({ where: { status: SubscriberStatus.UNSUBSCRIBED } }),
  ])

  return {
    subscribers,
    total,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    counts: { pending, confirmed, unsubscribed },
  }
}
