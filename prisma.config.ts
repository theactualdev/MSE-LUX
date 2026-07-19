import 'dotenv/config'
import { defineConfig } from 'prisma/config'

/**
 * Prisma CLI configuration (migrations, introspection, generate).
 *
 * Supabase exposes two connection strings: a pooled one (pgbouncer, port 6543) and a
 * direct one (port 5432). DDL and migrations cannot run through the pooler, so the CLI
 * is pointed at `DIRECT_URL`. The runtime client uses the pooled `DATABASE_URL` instead
 * — see `src/lib/db.ts`. Prisma 7 removed the schema-level `directUrl` field, so this
 * split is expressed here rather than in `schema.prisma`.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env['DIRECT_URL'],
  },
})
