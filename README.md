# MSE Lux

E-commerce storefront and admin for MSE Lux — handmade beads, jewelry and
accessories, made in Lagos and shipped worldwide.

Next.js 16 (App Router) · React 19 · Prisma 7 / Postgres (Supabase) ·
Tailwind v4 · Base UI · Paystack · ShipBubble · Resend · Vitest.

## Getting started

```bash
npm install
npx prisma generate
npm run dev
```

The dev server runs at http://localhost:3000.

### Environment

Copy the real values into `.env` — the app validates them at startup
(`src/lib/env.ts`) and fails loudly rather than running half-configured.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres connection string (Supabase pooler) |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase auth (browser + server clients) |
| `NEXT_PUBLIC_SITE_URL` | Canonical origin. Used for canonicals, `og:*`, sitemap and JSON-LD |
| `NEXT_PUBLIC_BRAND_NAME` | Brand name shown in chrome |
| `PAYSTACK_SECRET_KEY` / `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY` | Payments + webhook verification |
| `SHIPBUBBLE_API_KEY` | Live courier rates and label booking |
| `SHIPBUBBLE_ORIGIN_ADDRESS_CODE` | The store's validated pickup address |
| `SHIPBUBBLE_CATEGORY_ID` | ShipBubble package category |
| `SHIPBUBBLE_QUOTE_SECRET` | HMAC key signing shipping quote tokens |
| `RESEND_API_KEY` / `EMAIL_FROM` | Transactional email |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | Rate limiting (fails open) |
| `CRON_SECRET` | Authenticates the order-reaper cron route |

> `NEXT_PUBLIC_*` values are inlined at **build time**. Changing one in Vercel
> has no effect until the next deploy.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` | Production build (also runs the TypeScript check) |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run test` | Vitest, once |
| `npm run test:watch` | Vitest, watching |
| `npm run db:generate` | Regenerate the Prisma client |
| `npm run db:seed` | Seed catalog taxonomy (and demo products — see below) |
| `npm run db:studio` | Prisma Studio |
| `npm run brand:assets` | Regenerate favicon, apple-icon, logo and OG card from `assets/brand/logo-source.jpeg` |

## Conventions worth knowing before you change anything

**Migrations are create-only.** Generate them, never apply them from here —
no `prisma migrate deploy` or `migrate dev` against a shared database. The
developer applies migrations deliberately.

**The app never holds a Supabase `service_role` key.** Roles live in
`app_metadata` and are seeded out of band via SQL. Server Actions re-check the
role themselves: the `(admin)` layout gate covers *rendering* only, and every
action is a public HTTP endpoint.

**Money is integer minor units, everywhere.** Never floats. Products carry both
NGN and USD prices, and the charged amount is always derived on the server —
`placeOrder` accepts a discount code or a signed quote token, never an amount.

**Seeding will not overwrite real catalog.** `npm run db:seed` seeds taxonomy
always, but skips demo products when the database already holds any product the
fixture doesn't know about. Use `SEED_PRODUCTS=force` for a scratch database.

**Navigation comes from the database**, not a code fixture — categories created
in the admin appear in the header, mega menu, drawer and footer. It is read once
in `AppShell` and passed down.

**Route render classes are an invariant.** `next build` prints a route table;
a change should not silently flip a page from static (`○`) to dynamic (`ƒ`).
Diff it.

**Test counts, not exit codes.** Vitest can exit 0 while dropping a worker that
failed to start. Compare file/test counts against the previous run and re-run
any dropped file in isolation.

## Layout

```
src/app/(storefront)   customer-facing routes  ─┐ two root layouts
src/app/(admin)        admin, role-gated       ─┘
src/features/*         feature modules (catalog, cart, checkout, orders, admin, …)
src/components/ui      primitives      src/components/brand  brand chrome
src/lib                db, env, seo, nav, utils
prisma/                schema, migrations, seed
scripts/               brand asset generation
docs/                  specs, plans and phase notes (gitignored)
```

## Deployment

Vercel, from `main`. Supabase provides Postgres and auth; the storefront runs on
ISR with an hourly window, so catalog edits surface without a redeploy.
