---
id: neon-db-separation
title: "ADR-004 slice 0 — Separate staging/production Neon databases (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-08-08
visibility: internal
summary: Split the shared staging/production Neon database into two isolated Neon projects — prod stays on the existing project untouched, staging moves to a fresh project — the environment-isolation prerequisite before any vendorId work.
tags: [multi-tenancy, neon, database, environments, ops]
related: [adr-004-multi-tenancy, env-setup, architecture]
---

# ADR-004 slice 0 — Separate staging/production Neon databases (plan)

The narrative for the first slice of ADR-004 (issue #56, parent #49). `requirements.md` holds the
checkable criteria; this file explains why they're the right ones.

**Goal:** stop staging and production from sharing one Neon database, so environment isolation is
real *before* the multi-tenant `vendorId` migration lands. After this slice, a staging test can no
longer read or mutate live production rows.

**Scope (this slice):**
- **Production keeps the existing Neon project, untouched** — zero risk to live data, no migration,
  no cutover. Its GitHub `DIRECT_URL` and Cloudflare `DATABASE_URL` are unchanged.
- **Staging moves to a brand-new Neon project** (created by the owner during proposal sign-off).
  Staging's GitHub `DIRECT_URL` (CI migrations) and Cloudflare Worker `DATABASE_URL` (runtime) now
  point at the new project — both already set via `secrets/staging.vars` + `scripts/configure-env.mjs`.
- **Apply schema + seed to the new staging project.** `prisma migrate deploy` runs against staging's
  `DIRECT_URL` (the existing `deploy-staging.yml` step already does this on a staging push), then a
  **one-time** `npm run db:seed` bootstraps catalogue data into the fresh project.
- **Restore the demo accounts on the fresh staging project via the demo-accounts tool (#57).** The
  demo accounts the `/dev` feature relies on (`demo-admin@example.com` = ADMIN,
  `demo-customer@example.com` = CUSTOMER) are **not** produced by `seed.ts` or any script — they were
  hand-created in the old shared DB, so a fresh project starts without them. Rather than re-create
  them by hand, this slice runs the standalone **demo-accounts tool** (its own spec `demo-accounts-tool`,
  issue #57) `add` against the new staging project, which honours the standing "keep demo accounts in
  prod + staging until all phases complete" directive and makes them reproducible for the later
  slice-1 `vendorId` reset too. The tool ships in its own slice; slice 0 only consumes it.
- **Prove isolation** by writing a distinct marker `HealthCheck` row into staging and confirming it
  surfaces in staging `/api/health` (`db.label`) but never in production `/api/health`.
- **Update `docs/env-setup.md`** to record the one-project-per-environment topology (the shared-DB
  era is over) and how to bootstrap a fresh environment DB. `CHANGELOG.md` updated (Gate 4).

**Deliberately excluded:**
- The `Vendor` entity, `vendorId` columns, per-vendor uniques — that's **slice 1**, not this one.
- **Building the demo-accounts tool** — that's its own slice (`demo-accounts-tool`, #57). Slice 0
  only *runs* it against staging; it does not implement it, and deliberately does not add demo
  accounts to `prisma/seed.ts` (they stay separately managed).
- Repository-layer enforcement, host→tenant resolver, auth cookie/`VendorMembership`, branding —
  **slices 2–4**.
- **No CI seed step** added to `deploy-staging.yml`: staging is seeded **once, manually**, not on
  every deploy — keeps the workflow unchanged and avoids re-seeding churn. The workflow already runs
  `migrate deploy`, which is idempotent, so no workflow edit is needed at all.
- **No production data migration, no downtime, no Neon branches** — prod is deliberately left in
  place, and separate *projects* (not branches) are used, per ADR-004.
- No change to `scripts/configure-env.mjs` — it already routes `DIRECT_URL`→GitHub and
  `DATABASE_URL`→Cloudflare correctly; only the *values* in `secrets/staging.vars` changed.

**Open items carried forward:**
- The one-time staging seed and the isolation-marker insert require the staging `DIRECT_URL`
  (from `secrets/staging.vars`); tracked in #56. These are ops steps run against staging, not app code.
- The demo-accounts tool (#57) must ship (or at least its `add` be runnable) before the staging
  cutover completes, so R4 can pass; slice 0 depends on it for demo-account restoration.
- The unenforced production approval gate (GitHub free-plan limitation, `CLAUDE.md` "Known gap")
  is unrelated to this slice and stays as-is.
