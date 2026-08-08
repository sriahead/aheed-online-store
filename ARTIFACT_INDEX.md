<!--
  ARTIFACT_INDEX.md — GENERATED FILE. DO NOT EDIT BY HAND.
  Produced by: kms/scripts/build-index.ts (walks **/*.md(x), reads front-matter).
  Regenerated and diffed in CI (gates.yml) — a stale index fails the PR, exactly
  like the Gate-4 CHANGELOG check. Source of truth is each doc's front-matter, not
  this table. To change a row, edit that doc's front-matter and let CI rebuild.

  Columns: Artifact (title) · Type · Version · Updated · Status · Visibility · Summary
  Path is the link target. Grouped by derived track (audience → track).
-->

# Artifact Index

_Generated from front-matter across the repo. Last build: `2026-08-08T11:51:31.474Z` · commit `fd892d5` · `32` artifacts._

**Legend** — Status: `draft` → `review` → `approved` → `deprecated` ·
Visibility: `internal` (dev/staff site, behind Access) · `public` (help centre).

---

## Track 1 — Internal / Engineering (`internal-eng`)  ·  audience: dev

| Artifact | Type | Ver | Updated | Status | Vis | Summary |
|---|---|---|---|---|---|---|
| [CLAUDE.md — AI Assistant Guardrails](CLAUDE.md) | doc | 1.0.0 | 2026-08-06 | approved | internal | AI assistant guardrails for the Aheed Online Store — runtime/hosting, database, schema, storage, config, CI/CD, and the SDD gates every session must follow. |
| [Environment Setup — Secrets & Config (staging / production)](docs/env-setup.md) | doc | 1.2.0 | 2026-08-08 | approved | internal | How to configure all required secrets/env vars for an environment with one command (scripts/configure-env.mjs), routing each to the correct store and never exposing values, plus DB isolation and the demo-accounts tool. |
| [Onboarding](docs/onboarding.md) | doc | 1.1.0 | 2026-08-06 | approved | internal | 5-minute start-here guide — where the project actually is, prerequisites, local setup, and how to get a new developer running, tested, and branching independently. |
| [Repository Structure](docs/repo-structure.md) | doc | 1.1.0 | 2026-08-07 | approved | internal | The agreed target folder layout for the Next.js + Prisma + Cloudflare app, Clean Architecture layering, and which phase scaffolds each folder. |
| [Walking-Skeleton Runbook (M0)](docs/walking-skeleton-runbook.md) | runbook | 1.0.0 | 2026-08-06 | approved | internal | Step-by-step runbook to stand up the M0 walking skeleton — Cloudflare, R2, Neon, and GitHub environment provisioning through to a green production health check. |
| [M0 — Walking Skeleton (plan)](specs/2026-08-05-m0-walking-skeleton/plan.md) | spec | 1.0.0 | 2026-08-06 | approved | internal | Plan for the smallest possible end-to-end app (Next.js on Workers, Neon, CI/CD) proving the Cloudflare + Neon pipeline before any feature work begins. |
| [P0 — Design-System Tokens (plan)](specs/2026-08-06-design-system/plan.md) | spec | 1.0.0 | 2026-08-06 | approved | internal | Plan for installing Tailwind CSS v4 and encoding the Aheed brand kit as design tokens, closing the last item deferred from P0's first slice. |
| [Aheed KMS — Design (structure, deployment, schema)](specs/2026-08-06-kms/plan.md) | spec | 0.1.0 | 2026-08-06 | draft | internal | Folder structure, deployment plan, and front-matter schema for the Aheed knowledge system — phased to M0 reality, with a generated index and an internal/public publication split. |
| [KMS — Front-Matter Backfill (plan)](specs/2026-08-06-kms-backfill/plan.md) | spec | 1.0.0 | 2026-08-06 | approved | internal | Plan for backfilling front-matter onto the docs that predate the KMS schema, closing the last deferred item from the KMS foundation slice. |
| [KMS — Gate Wiring (plan)](specs/2026-08-06-kms-gates/plan.md) | spec | 1.0.0 | 2026-08-06 | approved | internal | Plan for wiring kms:validate and an ARTIFACT_INDEX.md staleness check into gates.yml, closing the last deferred item from the KMS design's Gate-wiring section. |
| [KMS — Index Generator, Assembly & Internal Site (plan)](specs/2026-08-06-kms-site/plan.md) | spec | 1.0.0 | 2026-08-06 | approved | internal | Plan for the ARTIFACT_INDEX.md generator, the assemble script, and the internal Nextra docs site — the deferred follow-up to the KMS schema/validator foundation slice. |
| [P0 — Foundation & Scaffolding (plan)](specs/2026-08-06-p0-foundation/plan.md) | spec | 1.0.0 | 2026-08-06 | approved | internal | Plan for P0's first slice — SDD git hooks, Prettier, SEO/PWA routes, and test setup — scoped to what M0 didn't already build. |
| [P1a — Email/Password Auth, RBAC, Account Shell (plan)](specs/2026-08-06-p1-auth/plan.md) | spec | 1.0.0 | 2026-08-06 | approved | internal | Plan for the first P1 slice — Better Auth email/password, RBAC, verification/reset emails, and an account shell — split from Google Sign-In, which needs OAuth credentials the human must create first. |
| [P1b — Google Sign-In (plan)](specs/2026-08-06-p1b-google-signin/plan.md) | spec | 1.0.0 | 2026-08-06 | approved | internal | Plan for adding Google as a Better Auth social provider alongside P1a's email/password flow, now that the human has provisioned the OAuth client and its secrets on Cloudflare. |
| [Dev View — Admin diagnostics page (plan)](specs/2026-08-07-dev-view/plan.md) | spec | 1.0.0 | 2026-08-07 | draft | internal | A minimal ADMIN-gated /dev page showing non-secret environment diagnostics (deployed commit, environment, integration on/off flags, session) and a link to the KMS internal docs. |
| [P2.5a — Ratings & Reviews Backend (plan)](specs/2026-08-07-p2-5a-ratings-reviews/plan.md) | spec | 1.0.0 | 2026-08-07 | approved | internal | Plan for the first P2.5 slice — a real Review model, auth-gated submission, and denormalized rating aggregation — laying the real data P2.5b's visual redesign will display. |
| [P2.5b1 — Visual Redesign Foundation (plan)](specs/2026-08-07-p2-5b1-visual-foundation/plan.md) | spec | 1.0.0 | 2026-08-07 | approved | internal | Plan for the foundation half of P2.5b — design tokens ingested from the real brand kit, schema/filter extensions, and expanded seed data — laying real material for P2.5b2's UI work to consume. |
| [P2.5b2 — Storefront Visual Redesign UI (plan)](specs/2026-08-07-p2-5b2-visual-ui/plan.md) | spec | 1.0.0 | 2026-08-07 | draft | internal | Plan for the UI half of P2.5b — applies P2.5b1's tokens/schema/seed to a real storefront layout, header, hero, redesigned product cards, category sidebar, and speciality filters matching the AI Studio mockup. |
| [P2a — Catalogue Browsing (plan)](specs/2026-08-07-p2a-catalogue-browsing/plan.md) | spec | 1.0.0 | 2026-08-07 | approved | internal | Plan for the first P2 slice — categories, product pages, images via the storage port, and keyset pagination — split from search & filters, which lands separately as P2b. |
| [P2b — Catalogue Search & Filters (plan)](specs/2026-08-07-p2b-catalogue-search/plan.md) | spec | 1.0.0 | 2026-08-07 | approved | internal | Plan for the second P2 slice — global search across products plus price/availability filters on both search and category pages — layered on P2a's schema and repositories. |
| [Demo-accounts add/remove tool (plan)](specs/2026-08-08-demo-accounts-tool/plan.md) | spec | 1.0.0 | 2026-08-08 | draft | internal | A standalone, reusable script to add or remove the platform's demo login accounts on demand against any environment, separate from prisma/seed.ts, so demo accounts survive DB resets and can be managed independently. |
| [ADR-004 slice 0 — Separate staging/production Neon databases (plan)](specs/2026-08-08-neon-db-separation/plan.md) | spec | 1.0.0 | 2026-08-08 | draft | internal | Split the shared staging/production Neon database into two isolated Neon projects — prod stays on the existing project untouched, staging moves to a fresh project — the environment-isolation prerequisite before any vendorId work. |
| [System Architecture — Aheed Online Store](specs/architecture.md) | doc | 1.1.0 | 2026-08-07 | approved | internal | The technical source of truth for infrastructure and Clean Architecture layering — Cloudflare Workers + Neon + S3-compatible storage, vendor-agnostic by design. |
| [ADR-001 — Hosting, Database & Egress](specs/decisions/ADR-001-hosting.md) | adr | 2.0.0 | 2026-08-06 | approved | internal | Revised hosting decision — Cloudflare Workers + Neon Serverless Postgres + R2, superseding the original GCP Cloud Run + Cloud SQL design, for a vendor-agnostic serverless origin. |
| [ADR-002 — Authentication Library](specs/decisions/ADR-002-auth-library.md) | adr | 1.0.0 | 2026-08-06 | approved | internal | Decision to use Better Auth (self-hosted, bearer tokens, RBAC) for email/password and Google Sign-In, rejecting hosted IdPs like Clerk/Auth0 for the MVP. |
| [ADR-003 — Object Storage Abstraction (S3-compatible)](specs/decisions/ADR-003-storage-abstraction.md) | adr | 1.0.0 | 2026-08-06 | approved | internal | Access object storage only via the S3-compatible API behind a StorageService port; the DB stores relative keys and URLs are composed at read time. |
| [ADR-004 — Multi-Tenancy (DB-driven vendors, regions & branding)](specs/decisions/ADR-004-multi-tenancy.md) | adr | 1.0.0 | 2026-08-08 | approved | internal | Evolve from single-vendor to a multi-tenant platform where vendors, regions, locations, delivery areas, and branding come from the database, sharing one business-logic and data layer. Row-level vendorId isolation, subdomain resolution with custom-domain override, family-scoped SSO. |
| [Design System](specs/design-system.md) | doc | 1.3.0 | 2026-08-07 | approved | internal | The authored decision doc for Aheed's visual language — brand-kit colors, typography, shape tokens, and the open items (logo assets, danger-color role) carried into later phases. |
| [Mission](specs/mission.md) | doc | 1.0.0 | 2026-08-06 | approved | internal | The problem Aheed's online store solves, target users (customers/staff/admin), MVP scope, success criteria, and open items carried into later phases. |
| [Roadmap](specs/roadmap.md) | doc | 1.5.0 | 2026-08-07 | approved | internal | Master backlog and phase sequencing (M0, P0-P8, plus inserted P2.5) for the Aheed Online Store, plus the running change log of roadmap revisions and phase closures. |
| [SDD Workflow](specs/sdd-workflow.md) | doc | 1.0.0 | 2026-08-06 | approved | internal | The seven-stage SDD workflow (Orient, Propose, Spec, Build, Validate, Document, Ship), each also an invokable Claude Code slash command, expanding CLAUDE.md's four gates. |
| [Tech Stack](specs/tech-stack.md) | doc | 1.0.0 | 2026-08-06 | approved | internal | Technical guardrails for the Aheed Online Store — application, data, auth, storage, payments, email, hosting, caching, compliance, and testing choices, with the ADRs that govern where they differ from the original proposal. |

## Track 2 — Staff / Operations (`staff-ops`)  ·  audience: staff

| Artifact | Type | Ver | Updated | Status | Vis | Summary |
|---|---|---|---|---|---|---|
| _`<no artifacts yet>`_ | | | | | | |

## Track 3 — Customer / Help Centre (`customer-help`)  ·  audience: customer

| Artifact | Type | Ver | Updated | Status | Vis | Summary |
|---|---|---|---|---|---|---|
| _`<no artifacts yet>`_ | | | | | | |
