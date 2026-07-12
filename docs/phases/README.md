# MSE Lux — Phase Documentation

This directory is the home for all phase-scoped documents. Each phase gets its own
folder containing (as it progresses):

- `spec.md` — the approved design/spec (from brainstorming)
- `plan.md` — the detailed implementation plan (from writing-plans)
- `summary.md` — the end-of-phase report (completed work, decisions, files, tests, outstanding)

Top-level product docs (e.g. `../PRD.md`) live outside this folder.

## Roadmap

| # | Phase | Folder | Deliverable |
|---|-------|--------|-------------|
| 1 | Foundation | `phase-1-foundation/` | Feature-first structure, design tokens/theme, base component library, app shell/nav, money + provider architectural seams. No backend. |
| 2 | Storefront | `phase-2-storefront/` | Full public storefront with mock data: home, collections, categories, PDP, search, wishlist, cart, checkout UI, content pages, auth pages, customer dashboard, 404. |
| 3 | Database | `phase-3-database/` | Normalized Prisma schema (Supabase Postgres), migrations, relationships, indexes. |
| 4 | Authentication | `phase-4-authentication/` | Supabase Auth; guest/customer/admin/super-admin; RBAC throughout. |
| 5 | Backend integration | `phase-5-backend-integration/` | Replace all mock data with real backend across every page. |
| 6 | Payments | `phase-6-payments/` | Paystack behind the payment-provider interface; verification, webhooks, audit trail. |
| 7 | Shipping | `phase-7-shipping/` | ShipBubble behind the shipping-provider interface; live rates, shipment creation, tracking. |
| 8 | Admin dashboard | `phase-8-admin-dashboard/` | Products/orders/customers/promotions/inventory management, analytics. |
| 9 | CMS / SEO / Launch | `phase-9-cms-seo-launch/` | CMS, SEO, analytics, performance, accessibility, testing, deployment. |

Status legend: ⬜ not started · 🟡 in progress · ✅ complete

- ✅ Phase 1 — spec approved; implementation plan in progress
- ⬜ Phases 2–9 — not started
