import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@/generated/prisma/client'

/**
 * Shared PrismaClient.
 *
 * Prisma 7 requires a driver adapter rather than a datasource URL, so the pooled
 * Supabase connection (`DATABASE_URL`, pgbouncer) is handed to `PrismaPg` here. The
 * direct connection (`DIRECT_URL`) is used only by the CLI for migrations — see
 * `prisma.config.ts`.
 *
 * The instance is cached as a module-level singleton so repeated `db.<model>` property
 * accesses (each of which re-enters the Proxy's `get` trap below) reuse one client — and
 * one underlying `pg.Pool` — instead of opening a fresh pool per access. In development
 * it is additionally cached on `globalThis` so Next's hot reload doesn't discard that
 * singleton and open a new pool on every refresh; module-level state alone doesn't
 * survive HMR, but does survive across the many property accesses within one process,
 * which is what production needs. Without the module-level cache, `next build`'s static
 * generation (many routes now read the catalog per Task 5a) opens a new pool on every
 * single `db.product`/`db.category`/`db.collection` access and exhausts the Supabase
 * pooler's connection cap (`EMAXCONN`) well before the build finishes.
 *
 * Construction is deferred to first property access (via the `Proxy` below) rather than
 * happening at module load: eagerly constructing here would throw the instant any route
 * imports `db` if `DATABASE_URL` isn't set yet, which would fail `next build` in any
 * environment where the URL is only injected at runtime rather than at build time.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }
let cachedClient: PrismaClient | undefined

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set — add it to .env (see docs/phases/phase-3-database/spec.md).')
  }
  return new PrismaClient({ adapter: new PrismaPg(connectionString) })
}

function getPrismaClient(): PrismaClient {
  if (globalForPrisma.prisma) return globalForPrisma.prisma
  if (cachedClient) return cachedClient

  const client = createPrismaClient()
  if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = client
  } else {
    cachedClient = client
  }
  return client
}

// A Proxy around the lazily-created client: every property/method access (`db.product`,
// `db.$transaction`, ...) resolves the real client on demand via `getPrismaClient()`, so
// nothing runs — and no error can throw — until `db` is actually used. The exported name
// and type are unchanged, so every existing call site keeps working as-is.
export const db = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    return Reflect.get(getPrismaClient(), prop, receiver)
  },
})
