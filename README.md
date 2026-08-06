# Aheed Food Centre — Online Store

Custom, UK-compliant grocery e-commerce for **Aheed Food Centre**, on a **PostgreSQL-first,
vendor-agnostic** stack: **Next.js on Cloudflare Workers** (via `@opennextjs/cloudflare`),
**Neon Serverless Postgres** through **Prisma**, **S3-compatible object storage (R2)**, and
**Stripe**. Governed by **Spec-Driven Development (SDD), Solo Mode** — the four gates below.

## Current state: Milestone 0 done ✅ — starting P0

**Milestone 0 (Walking Skeleton)** is closed: `/api/health` returns `db.ok: true` on both staging
and production, with `gates`/`deploy-staging`/`deploy-production` all green end-to-end
(`browser → Worker → Prisma → Neon`). The app is still just one `HealthCheck` model, a landing
page, and `/api/health` — no feature work has started yet.

- **How M0 was run:** `docs/walking-skeleton-runbook.md`
- **Its spec:** `specs/2026-08-05-m0-walking-skeleton/`
- **Next up:** **P0 — Foundation & scaffolding**, per `specs/roadmap.md`, behind its own Gate-1 proposal.

## Quickstart

```bash
cp .env.example .env          # fill Neon DATABASE_URL (pooled) + DIRECT_URL (direct)
npm install
npm run db:migrate:dev        # create/apply the initial migration
npm run db:seed
npm run dev                   # http://localhost:3000  → "Database: connected ✓"
```
Cloudflare local preview (real Workers runtime): `npm run preview` (reads `.dev.vars`).

## The four gates (Solo Mode)

1. **Propose before work** — specs start as a proposal you confirm.
2. **Spec before code** — no source commit without an agreed feature spec.
3. **Validate before done** — tests + `validation.md` criteria pass before an item closes.
4. **Changelog before merge** — `CHANGELOG.md` is updated before a branch merges.

## Where things live

`app/` routes + headless `api/` · `lib/` ports+adapters (`db` Neon, `storage` S3, `config`) ·
`prisma/` schema+migrations · `components/` `features/` (grow per phase) · `design-system/` tokens ·
`specs/` constitution + per-feature specs + ADRs · `docs/` onboarding, runbook, repo structure ·
`.github/` CI gates + deploy workflows · `hooks/` SDD git hooks.

Branches: `feature/*` → **`staging`** (auto-deploy) → **`main`** (manual-approved production).

Full architecture, migration strategy, and ADRs: `specs/architecture.md` and `specs/decisions/`.
