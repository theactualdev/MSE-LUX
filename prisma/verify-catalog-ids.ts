// Read-only post-seed check: Phase 5a requires DB catalog ids to equal the authored
// mock ids (PROD-*) — the client cart/wishlist/recently-viewed stores resolve ids
// against the mock until 5c. Run after `npm run db:seed`:  npx tsx prisma/verify-catalog-ids.ts

// Must precede the `@/lib/db` import: unlike Next.js and prisma.config.ts, a standalone
// `tsx` process does not load `.env` on its own, so DATABASE_URL would be undefined.
import 'dotenv/config'

import { db } from '@/lib/db'

async function main(): Promise<void> {
  const [products, variants, misalignedProducts, misalignedVariants] = await Promise.all([
    db.product.count(),
    db.productVariant.count(),
    db.product.count({ where: { NOT: { id: { startsWith: 'PROD-' } } } }),
    db.productVariant.count({ where: { NOT: { id: { startsWith: 'PROD-' } } } }),
  ])
  console.log(`products: ${products} (misaligned ids: ${misalignedProducts})`)
  console.log(`variants: ${variants} (misaligned ids: ${misalignedVariants})`)
  if (misalignedProducts + misalignedVariants > 0) process.exitCode = 1
}

main()
  .then(async () => {
    await db.$disconnect()
  })
  .catch(async (error: unknown) => {
    console.error(error)
    await db.$disconnect()
    process.exitCode = 1
  })
