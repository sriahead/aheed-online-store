---
id: roadmap
title: Roadmap
audience: [dev]
type: doc
status: approved
version: "1.6.0"
updated: 2026-08-08
visibility: internal
summary: Master backlog and phase sequencing (M0, P0-P8, plus inserted P2.5) for the Aheed Online Store, plus the running change log of roadmap revisions and phase closures.
tags: [roadmap, phases, backlog]
---

# Roadmap

Master backlog for the Aheed Online Store (SDD Solo Mode). Phases deliver working software early
and minimise risk. The pivot to Cloudflare Workers + Neon adds a **Milestone 0** before P0:
prove the infrastructure end-to-end with a walking skeleton, *then* build features.

## Milestone 0 — Walking Skeleton (infrastructure proof) 🩻
The smallest app that exercises `browser → Worker → Prisma → Neon` on real infra, plus the full
CI/CD path (auto staging deploy, manual-approved production deploy). One `HealthCheck` model, a
landing page, and `/api/health`. **Exit criteria:** production `/api/health` returns `db.ok: true`
and the manual approval gate works. Spec: `specs/2026-08-05-m0-walking-skeleton/`. Runbook:
`docs/walking-skeleton-runbook.md`. No features, no auth, no design system — deliberately.

> Once M0 is green, the roadmap proceeds through P0–P8 below, each behind its spec and the four gates.

## Phases

- **P0 — Foundation & scaffolding.** Harden what M0 proved: tooling (ESLint/Prettier/Vitest/Husky),
  SDD git hooks, base app shell, `lib/config`/`lib/db`/`lib/storage` finalised, `public/` SEO/PWA
  surface, design-system tokens. Delivers a deployable, gated app skeleton.
- **P1 — Auth & accounts.** Better Auth: email/password + Google Sign-In, session/refresh, RBAC
  (Customer/Staff/Admin). Account area shell. Guest browsing.
- **P2 — Catalogue & browsing.** Categories, product pages (image via storage port + CDN using
  relative keys), search & filters, keyset pagination.
- **P2.5 — Ratings, reviews & storefront visual design.** Inserted after P2's close, not part of
  the original plan — the human's AI Studio design mockup (`aheedfoodcentre.ai.studio`) set an
  expectation for storefront polish and product ratings/reviews that P0–P2 deliberately deferred
  in favour of infrastructure first. Two slices: (a) real `Review` model + submission (gated to
  authenticated users, reusing P1's auth) + rating aggregation — data before display, so the
  visual pass consumes real numbers from day one, not placeholders revisited later; (b)
  storefront visual redesign (header/promo bar, hero, category sidebar, redesigned product
  cards/detail) matching the mockup's look, plus small schema additions (`origin`, discount
  pricing) the mockup's cards need. Explicitly excludes cart/"Add to Cart" wiring — that's P3,
  unchanged by this insertion.
- **P3 — Cart & checkout.** Cart (making the currently-inert "Add to Cart" real), guest + account
  checkout, Stripe payment, atomic order creation with stock decrement, on-screen + emailed
  confirmation. Also includes **"Shop your list"** (paste/build a list → match to catalogue → add
  to cart) — folded in here rather than a separate feature, since it's a cart-entry path.
- **P4 — Orders & delivery status.** Order history, three-step status with audit trail, staff
  updates, confirmation/delivery emails.
- **P5 — Loyalty & discounts.** Points earn/redeem; discounts engine; admin configuration.
- **P6 — Admin & staff panel.** Product/category management, availability, order dashboard,
  customer directory, discounts, loyalty rules, reports.
- **P7 — Compliance & hardening.** UK GDPR, PECR consent, T&Cs/Privacy, accessibility, OWASP
  hardening, backups + monitoring, index/query review vs NFR targets.
- **P8 — Deployment & launch.** Full Cloudflare + Neon + R2 wiring, secrets, backups/PITR,
  monitoring, UAT, production deployment, handover & training. Migration playbooks verified.

## Roadmap Change Log

| Date | Change | Reason |
|------------|-------------------------------|--------------------------------|
| _pending_  | Baseline set                  | To be recorded at Phase 3 freeze |
| 2026-08-05 | Architecture pivot to Cloudflare Workers + Neon + S3-compatible storage | PostgreSQL-first, vendor-agnostic, cost-effective mandate (supersedes GCP-origin ADR-001) |
| 2026-08-05 | Added **Milestone 0 — Walking Skeleton** before P0 | De-risk infra end-to-end before feature work |
| 2026-08-06 | **Milestone 0 closed.** `/api/health` returns `db.ok: true` on both staging and production; `gates`/`deploy-staging`/`deploy-production` all green. Infra learnings (Prisma driver-adapter config, Workers `fs` polyfill gaps, Next 16/Turbopack, CI secrets/environments) captured in `CLAUDE.md` and `CHANGELOG.md` rather than a separate retro. Known gap: no enforced required-reviewer gate on `production` (needs a paid GitHub plan). | Exit criteria met; proceeding to P0 |
| 2026-08-06 | **P0 closed** (backfilled retroactively — never logged here at the time). Foundation & scaffolding: SDD git hooks, Prettier, base app shell, `lib/config`/`lib/db`/`lib/storage` finalized, design-system tokens (Tailwind v4 + Aheed brand kit), `public/` SEO/PWA surface. | Exit criteria met; proceeding to P1 |
| 2026-08-07 | **P1 closed** (backfilled retroactively). Better Auth email/password + Google Sign-In, RBAC (Customer/Staff/Admin), account shell, guest browsing — split into P1a/P1b since Google Sign-In needed an OAuth client only the human could provision. | Exit criteria met; proceeding to P2 |
| 2026-08-07 | **P2 closed.** Categories, product pages, images via the S3-compatible storage port + CDN, keyset pagination, global search, price/availability filters — split into P2a/P2b so search/filters could be validated separately from core browsing. Real bugs caught and fixed while shipping: `next build` static-optimizing a Prisma-backed page (same root cause as P1b's `/login`/`/register` fix, now hit a second time — worth remembering as a pattern, not a one-off), a Cloudflare Security Level setting blocking CDN image serving on both staging and production zones, and a seed-script idempotency bug from a partial mid-run failure. Trigram/fuzzy search and a dedicated search service remain explicitly deferred until the catalogue actually grows past its current placeholder data. | Exit criteria met; proceeding to P2.5 |
| 2026-08-07 | **Added P2.5 — Ratings, reviews & storefront visual design**, inserted between P2 and P3. Not part of the original plan — the human's AI Studio design mockup (`aheedfoodcentre.ai.studio`) surfaced two gaps: storefront visual polish deferred in favour of infra-first delivery, and product ratings/reviews, never in the original P0–P8 scope at all. Two slices, reviews backend before the visual pass (real data before display). Explicitly excludes cart/"Add to Cart" wiring, unchanged as P3's scope. | Confirmed with the human; proceeding to P2.5a |
| 2026-08-07 | Identified a **new, unscheduled future item**: a "Developer Control Toolbar" (role/view switching, infra introspection), surfaced by the mockup's real exported source. Confirmed as intended real scope, not just demo navigation — tracked as issue #41, deliberately not placed in the phase sequence yet (needs its own `/propose`; its "Dev KMS" concept as shown conflicts with `CLAUDE.md`'s secrets posture if taken literally). | Tracked, unscheduled — not blocking P2.5b |
| 2026-08-07 | **P2.5 closed.** Ratings & reviews (auth-gated submission + denormalized aggregates) and the storefront visual redesign matching the AI Studio mockup — real header/hero/category-sidebar/redesigned cards, speciality (Halal/Fresh/Organic) filters, a postcode deliverability checker, and a two-layer token/schema/seed foundation underneath. Split into three slices (P2.5a reviews backend, P2.5b1 visual foundation, P2.5b2 UI) so each stayed independently validatable — the split kept catching real bugs (a seed idempotency gate that would have skipped every new category; rating fields P2.5a denormalized *for the cards* but no read path ever exposed until P2.5b2; `docs/ui-ref/` never excluded from lint/prettier/tsc). Cart/"Add to Cart" wiring stays inert by design — P3, unchanged. Deferred to their own issues: a homepage featured-products rail (#45, no backing data yet), `next/image` adoption (#46), and the Dev Control Toolbar (#41). | Exit criteria met; proceeding to P3 |
| 2026-08-07 | **Post-P2.5 storefront polish** shipped as fixes from live review (not a phase): Milton Keynes delivery area broadened to any MK district, real cropped logo, mobile-UI rework, and a browse-page layout flip — departments to a horizontal arrow-scrolled strip, search/filters to a vertical left sidebar (`DepartmentScroller` is the first storefront client component). **Multi-tenancy** flagged as a pre-P3 foundation (ADR-004 draft, #49) with an env-config CLI + `docs/env-setup.md` alongside. | Live-review feedback; not a roadmap phase |
| 2026-08-07 | **P3 scope confirmed/expanded:** the cart becomes real in P3 (the inert "Add to Cart" gets wired), and **"Shop your list"** is folded into P3 as a cart-entry path rather than a standalone feature — keeping the shopping flow in one phase. The **Developer Control Toolbar / dev view (#41)** is being pulled forward next as its own propose→spec→build. | Confirmed with the human |
| 2026-08-08 | **ADR-004 (multi-tenancy) Accepted** (`specs/decisions/ADR-004-multi-tenancy.md`, issue #49, v1.0.0). Four decisions locked: subdomain resolution + optional custom-domain override; row-level `vendorId` enforced in the repository layer; global identity with family-scoped SSO / isolated session per custom domain (authz via `VendorMembership`); separate the shared staging/prod Neon DB into two projects **first**. Sequenced as slices 0–4 to land **before P3**, since orders/carts/payments would otherwise bake in single-vendor assumptions across every repository query. Dev view (#41) is now implemented. | Decisions signed off with the human |
| 2026-08-08 | **ADR-004 slices 0–1 shipped to production.** Slice 0 (#56): staging/prod split into **separate Neon projects** (env isolation before tenant work). Slice 1 (#62): `Vendor` aggregate + empty `VendorBranding`/`VendorConfig`/`VendorDeliveryArea` satellites, required `vendorId` on Category/Product/Inventory/Review with per-vendor composite uniques and vendorId-leading indexes; a hand-authored migration backfilled all existing rows to a single Aheed vendor (applied cleanly on real prod data). Also shipped alongside: the standalone demo-accounts tool (#57) and the KMS internal docs site going live behind Cloudflare Access (#61). Deferred follow-ups tracked in #65 (roadmap note done here; migration-drift check pending). | Foundation landing before P3 |
| 2026-08-08 | **ADR-004 slice 2** (#66): repository-layer `vendorId` enforcement — a `getCurrentVendorId()` tenant seam (interim single-vendor; slice 3 swaps in host resolution) with `where: { vendorId }` injected across `lib/repositories/*`, plus an ESLint guard forbidding direct Prisma access in the app/UI/feature layers. Runtime output unchanged at one vendor. Slice 3 (host→tenant resolver + auth) and slice 4 (branding/delivery/config wiring) remain. | Proceeding through the ADR-004 slice sequence |
