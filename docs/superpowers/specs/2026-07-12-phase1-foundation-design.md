# Phase 1 — Foundation Design

**Project:** MSE Lux — luxury jewelry, handmade beads & accessories e-commerce platform
**Date:** 2026-07-12
**Phase:** 1 of 9 (Architecture Foundation — no backend)
**Status:** Approved scope, pending spec review

---

## 1. Purpose

Establish the technical and visual foundation the entire platform is built on: a
feature-first project structure, a token-driven design system in the MSE Lux
aesthetic, a base component library, the global app shell (navigation + footer),
and the two architectural seams that every later phase depends on (the money/pricing
model and the provider-interface pattern).

Phase 1 ships **no backend, no real page content, and no provider implementations.**
It ends when the app runs, the design system is demonstrably consistent, and the
seams are in place so Phases 2–9 slot in without refactoring the foundation.

## 2. Brand & Product Context

- **Brand:** MSE Lux (display name threaded through a single config value).
- **Business:** Lagos-based handmade beadmaker selling beads, jewelry & accessories.
- **Personality:** Elegant, premium, minimal, fashion-forward, mobile-first, trustworthy.
- **Benchmarks:** Oroton, Mejuri, COS, Apple, Aesop.
- **Aesthetic rules (locked by `DESIGN_SYSTEM.md` + `PROJECT_RULES.md`):**
  Playfair Display headings / Inter body; `rounded-xl`; 48px buttons; subtle card
  shadows; edge-to-edge product imagery; 8-pt spacing; Framer Motion only; **≤3 font
  sizes per page**. Never: neon, glassmorphism, bright gradients, over-animation,
  generic SaaS layouts. Product photography is always the hero.

## 3. Goals / Non-Goals

**Goals**
- Feature-first folder structure with clear, documented boundaries.
- Two-layer design-token system (primitive → semantic) as the single source of truth.
- Base shadcn/ui + Radix component set themed to MSE Lux.
- Responsive, accessible app shell: announcement bar, sticky header w/ mega-menu shell,
  icon slots (search/wishlist/cart/account), mobile drawer, footer.
- Money/pricing abstraction: dual authored prices + geo display + FX resolver (logic
  only, unit-tested).
- Provider-interface pattern for payments/shipping/email (interfaces + registry, no
  concrete providers).
- Minimal Zustand UI store; Framer Motion motion primitives; Zod-validated env.
- A living design-system reference page at hidden route `/_design`.

**Non-Goals (deferred to later phases)**
- Real pages, mock product data, product-specific components (ProductCard, PDP gallery)
  → Phase 2.
- Cart/checkout logic, wishlist persistence → Phase 2.
- Database, Prisma schema → Phase 3.
- Auth (Supabase) → Phase 4.
- Provider implementations (Paystack/ShipBubble/Resend) → Phases 6–8.
- React Hook Form (Phase 2 forms), TanStack Query (Phase 5 data fetching).

## 4. Architecture

### 4.1 Platform note (hard constraint)
`AGENTS.md` states this Next.js (v16.2.10) has breaking changes vs. prior versions.
**The first implementation task is to read the relevant guides under
`node_modules/next/dist/docs/` (App Router layouts, `next/font`, `next.config`, metadata)
and confirm current APIs before writing code.** Do not assume Next 15 conventions.
React is 19.2.4, Tailwind is v4 (CSS-first `@theme`, no `tailwind.config.js`).

### 4.2 Folder structure
```
src/
  app/                 # routes, layouts, route groups
    (marketing)/       # placeholder route group for future storefront
    _design/           # hidden design-system reference page
    layout.tsx         # root layout: fonts, providers, <AppShell>
    globals.css        # Tailwind v4 @theme tokens + base layer
  components/
    ui/                # shadcn primitives (button, input, sheet, dialog, ...)
    brand/             # MSE Lux wrappers/compositions (Logo, AnnouncementBar, ...)
    layout/            # Header, Footer, MobileDrawer, MegaMenu shell
  features/            # feature-first modules (empty; filled in later phases)
  server/              # server-only code (empty until Phase 3+)
  services/            # provider abstractions: payments/, shipping/, email/
  lib/                 # cross-cutting: money/, env, cn(), config
  hooks/               # shared React hooks (e.g. useMediaQuery, useReducedMotion)
  stores/              # Zustand stores (ui store now; cart later)
  types/               # shared TS types (Money, PriceSet, Currency, ...)
  utils/               # pure helpers
```
Rationale: matches the brief's feature-first mandate; keeps business logic
(`features/`, `services/`, `server/`) out of UI (`components/`, `app/`).

### 4.3 Design tokens (Tailwind v4, CSS-first)
Single source of truth in `globals.css` via `@theme`. Two layers:
- **Primitive tokens** — raw values: warm ivory/cream backgrounds, champagne-gold
  accent, warm charcoal text, neutral greys; 8-pt spacing scale; radius scale
  (default `xl`); type scale (≤3 sizes surfaced per page).
- **Semantic tokens** — `--color-background`, `--color-foreground`, `--color-accent`,
  `--color-muted`, `--color-border`, etc., mapped from primitives. shadcn components
  and all app code consume **semantic** tokens only, never raw hex.
- Dark mode: token slots defined but light-first; a `.dark` scope reserved (not a
  Phase 1 deliverable to fully theme).
- Fonts: Playfair Display (display/headings) + Inter (body) via `next/font`, exposed
  as CSS variables `--font-display` / `--font-sans`.

### 4.4 Component library
shadcn/ui initialized for Tailwind v4 + React 19. Phase 1 primitives only:
`button, input, textarea, label, sheet (drawer), dialog, dropdown-menu,
navigation-menu, card, badge, separator, skeleton, sonner (toast), scroll-area,
aspect-ratio, avatar`. Brand wrappers in `components/brand/`: `Logo`, `AnnouncementBar`,
`Container`, `SectionHeading`. Button height fixed to 48px per design system;
`rounded-xl` default radius. All interactive components keyboard-accessible (Radix
gives this) and WCAG AA contrast verified against the token palette.

### 4.5 App shell / navigation
- **Header:** sticky; announcement bar above it; logo; primary nav with a **mega-menu
  shell** (structure + animation, placeholder category data); right-side icon slots for
  search, wishlist, cart, account (badge-capable, no real counts yet).
- **Mobile:** `Sheet`-based drawer navigation; search entry; login link.
- **Footer:** newsletter signup slot (non-functional), link columns, social (IG), legal.
- Motion: Framer Motion for menu/drawer transitions; respects `prefers-reduced-motion`.
- Placeholder nav taxonomy (real taxonomy = Phase 2): Jewelry, Beads, Accessories,
  Collections, About.

### 4.6 Money / pricing abstraction (logic only)
Encodes the confirmed rule: **admin authors two independent prices per product (NGN
and USD); display currency is chosen by user geo** — Nigeria → authored ₦; US →
authored $; elsewhere → authored $ converted to local currency via live FX (display).
```
types/money.ts
  type Currency = 'NGN' | 'USD' | string        // ISO 4217; NGN/USD are authored
  interface Money { amountMinor: number; currency: Currency }  // minor units (kobo/cents)
  interface PriceSet { ngn: Money; usd: Money }  // both admin-authored, neither derived

lib/money/
  format.ts        # locale-aware formatting (Intl.NumberFormat)
  resolve.ts       # resolveDisplayPrice(priceSet, target, fxRates): Money
                   #   target 'NGN' -> priceSet.ngn
                   #   target 'USD' -> priceSet.usd
                   #   other        -> convert(priceSet.usd, fxRate[target])
  fx.ts            # FxRateProvider interface (impl deferred); no network in Phase 1
```
Geo → currency selection and live FX fetching are **wired in Phase 2/5**; Phase 1
ships the pure, unit-tested resolver + formatter with injected rates. This guarantees
money handling never uses floats and is centralized.

### 4.7 Provider-interface pattern (interfaces only)
`services/{payments,shipping,email}/` each expose a TypeScript interface + a simple
registry/factory so later phases add a concrete provider without touching callers.
```
services/payments/types.ts   interface PaymentProvider { initialize(), verify(), ... }
services/payments/registry.ts getPaymentProvider(name): PaymentProvider
services/shipping/types.ts    interface ShippingProvider { getRates(), createShipment(), track() }
services/email/types.ts       interface EmailProvider { send(template, data) }
```
Method signatures are best-effort in Phase 1 and may be refined when the real provider
(Paystack/ShipBubble/Resend) is integrated — the *pattern* is what Phase 1 locks in.

### 4.8 State & env
- **Zustand:** `stores/ui.ts` for ephemeral UI state (drawer open, search open,
  mobile menu). Cart store stubbed/deferred to Phase 2.
- **Env validation:** `lib/env.ts` parses `process.env` with a Zod schema and fails
  fast on missing/invalid vars. Phase 1 schema is minimal (e.g. `NEXT_PUBLIC_SITE_URL`,
  `NEXT_PUBLIC_BRAND_NAME`) and grows each phase.
- **Config:** `lib/config.ts` holds brand constants (name = "MSE Lux", supported
  authored currencies, social links) — the single place to rename the brand.

## 5. Error / Empty / Loading States
Foundation-level only: `Skeleton` primitives available; a shared error boundary and a
`not-found.tsx` (404) styled to the brand are included so later pages inherit them.
Full empty/error/success treatments per feature come with those features.

## 6. Testing Strategy
- **Unit (Vitest):** `lib/money` resolver + formatter (authored-price selection, FX
  conversion, minor-unit integrity, formatting per locale); `lib/env` schema failure.
  This is the highest-value logic in Phase 1 and is TDD'd.
- **Component sanity:** the `/_design` page renders every primitive; used as manual +
  visual QA surface across all later phases.
- **Lint/typecheck:** ESLint + strict TypeScript pass clean; `next build` succeeds.
- Provider interfaces and UI shell are structural; verified via typecheck + the design
  page rather than heavy tests at this stage.

## 7. Deliverables (file-level)
- Configured `globals.css` with `@theme` tokens; fonts wired in root layout.
- `src/` folder structure per 4.2 with README notes in key dirs.
- shadcn primitives in `components/ui/`; brand wrappers in `components/brand/`.
- `components/layout/`: `Header`, `AnnouncementBar`, `MegaMenu` (shell), `MobileDrawer`,
  `Footer`, assembled in an `AppShell` used by the root layout.
- `types/money.ts`, `lib/money/*`, with Vitest tests.
- `services/{payments,shipping,email}/` interface + registry stubs.
- `stores/ui.ts`, `lib/env.ts`, `lib/config.ts`, `hooks/`.
- `app/_design/page.tsx` design-system reference; branded `not-found.tsx`; error boundary.
- Dependencies added: shadcn/ui + Radix, framer-motion, zustand, zod, lucide-react,
  class-variance-authority, clsx, tailwind-merge, vitest (+ testing deps).

## 8. Success Criteria
- `npm run dev`, `npm run build`, `npm run lint`, and typecheck all pass.
- Design system visibly consistent on the `/_design` page; palette meets WCAG AA.
- App shell is fully responsive (mobile drawer ↔ desktop mega-menu) and keyboard-navigable.
- `resolveDisplayPrice` unit tests pass for all three geo cases + minor-unit handling.
- No business logic in UI components; provider interfaces compile and are unused-but-ready.
- Brand name changeable from one config value.

## 9. Open Items / Assumptions
- Exact Next 16 App Router / `next/font` / metadata APIs confirmed against bundled docs
  before coding (may adjust file conventions).
- shadcn CLI compatibility with Tailwind v4 + React 19 verified during setup; manual
  component addition is the fallback if the CLI misbehaves.
- Real category taxonomy, product schema, and FX/geo mechanism intentionally deferred.
- Dark mode slots are reserved but not fully themed in Phase 1.
