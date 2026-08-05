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
- **P3 — Cart & checkout.** Cart, guest + account checkout, Stripe payment, atomic order creation
  with stock decrement, on-screen + emailed confirmation.
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
