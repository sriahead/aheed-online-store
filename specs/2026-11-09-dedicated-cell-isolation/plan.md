---
id: 2026-11-09-dedicated-cell-isolation-plan
title: "Aheed Food Centre Dedicated Cell Isolation: Deployment Topology, Multi-Cell CI & Neon Isolation (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-11-09
visibility: internal
summary: "Dedicated cell deployment topology for Aheed Food Centre: separate Workers, dedicated Neon databases, separate R2 buckets, lockstep CI deployment across platform and client cells, and store isolation."
tags: [cells, multi-tenant, neon, isolation, cloudflare-workers, deployment]
related: [architecture, model-handoff]
---

# Dedicated Cell Isolation: Aheed Food Centre Deployment Topology & CI (Plan)

**Issue:** #1331 (Parent: #1337, Workstream P12-B)  
**Slice:** `specs/2026-11-09-dedicated-cell-isolation/`  
**Status:** Proposed (Gate 1)  

---

## 1. Problem & Context

Per `specs/architecture.md` ("Cells") and ADR-004:
- The Next.js application runs on Cloudflare Workers (`@opennextjs/cloudflare`) with `@prisma/adapter-neon`.
- Each Worker isolate maintains a single active database connection pool. Switching database connection targets dynamically per HTTP request was evaluated and rejected: it exhausts isolate socket limits, breaches connection bounds, and requires rewriting the entire repository and auth boundary.
- **ShopLocal (Platform Cell)**: Multi-tenant deployment on `merqify.com` (`aheed-staging`, `srimart-staging`, `aheed`, `srimart`), backed by the `Shoplocal` and `Shoplocal Staging` Neon databases. Tenants are isolated by tenant ID (`vendorId`).
- **Aheed Food Centre (Dedicated Client Cell)**: An independent business operating at `aheedfoodcentre.co.uk` (and `staging.aheedfoodcentre.co.uk`). It requires **physical database isolation** (its own Neon projects: `Aheed Food Centre` and `Aheed Food Centre Staging`, already created in the Merqify Neon organisation, currently empty).
- The dedicated cell shares the codebase, the Merqify Workers Paid plan, and the read-only `uk-location-reference` database, but has its own Workers, Neon database, R2 image bucket, secrets, and custom domain ingress.

---

## 2. Core Architecture & Topology

### 2.1 Topology Mapping

| Component | Platform Cell (Staging / Production) | AFC Dedicated Cell (Staging / Production) |
| :--- | :--- | :--- |
| **App Worker** | `aheed-store-staging` / `aheed-store-production` | `afc-store-staging` / `afc-store-production` |
| **Scheduler Worker** | `aheed-scheduler-staging` / `aheed-scheduler-production` | `afc-scheduler-staging` / `afc-scheduler-production` |
| **Inbound Email Worker** | `aheed-inbound-email-staging` / `aheed-inbound-email` | `afc-inbound-email-staging` / `afc-inbound-email` |
| **Neon Database** | `Shoplocal Staging` / `Shoplocal` | `Aheed Food Centre Staging` / `Aheed Food Centre` |
| **R2 Asset Bucket** | `shoplocal-images-staging` / `shoplocal-images-production` | `afc-images-staging` / `afc-images-production` |
| **KV Signals** | `aheed-jobs-staging` / `aheed-jobs-production` | Dedicated or partitioned KV namespaces for scheduler gating |
| **Primary Ingress** | `*.merqify.com` | `staging.aheedfoodcentre.co.uk` (staging via SaaS) / `www.aheedfoodcentre.co.uk` (prod via SaaS) |

---

## 3. Implementation Phases

### Phase 1: Wrangler Environment Configuration
1. In `wrangler.toml`:
   - Define dedicated cell environments: `[env.afc-staging]` and `[env.afc-production]`.
   - Configure custom domain routes for the dedicated hostnames (`staging.aheedfoodcentre.co.uk`, `www.aheedfoodcentre.co.uk`).
   - Configure separate R2 bucket bindings (`afc-images-staging`, `afc-images-production`).
   - Configure dedicated `[vars]` (e.g. `PLATFORM_NAME = "Aheed Food Centre"`, dedicated default sender / forward addresses).
2. In `workers/scheduler/wrangler.toml`:
   - Add matching scheduler environments `[env.afc-staging]` and `[env.afc-production]` targeting `APP_BASE_URL = "https://staging.aheedfoodcentre.co.uk"` and `https://www.aheedfoodcentre.co.uk`.
3. In `workers/inbound-email/wrangler.toml`:
   - Add matching inbound email environments.

### Phase 2: CI/CD Multi-Cell Lockstep Deployment
1. Update `.github/workflows/deploy-staging.yml` and `.github/workflows/deploy-production.yml`:
   - Maintain the single build step (`opennextjs-cloudflare build`) so identical build artifacts serve all cells.
   - Execute database migrations sequentially:
     1. Migrate platform database (`DIRECT_URL`).
     2. Migrate dedicated cell database (`AFC_DIRECT_URL`).
   - Route verification (`scripts/verify-worker-routes.ts`) verified per cell target.
   - Deploy platform workers, then deploy dedicated cell workers (`--env afc-staging` / `--env afc-production`).
   - **Zero Drift Guarantee:** If migration or deployment fails on any cell, CI fails and halts.

### Phase 3: Database Bootstrap & Provisioning Tooling
1. Migration application script/step against the dedicated Neon databases.
2. Bootstrap script `scripts/bootstrap-dedicated-cell.ts`:
   - Seeds initial `Vendor` record for Aheed Food Centre (`a4ed0000-0000-4000-a000-000000000001`).
   - Seeds `VendorDomain` matching `staging.aheedfoodcentre.co.uk` and `www.aheedfoodcentre.co.uk`.
   - Seeds initial store configuration (`VendorConfig`, delivery slots, delivery areas).
   - Zero demo accounts created in production (`#1332`).
3. Admin access via `scripts/grant-role.ts`.

### Phase 4: Architectural Documentation & ADR
1. Update `specs/architecture.md` detailing the dedicated cell topology.
2. Create ADR-009 ("Platform Cell and Dedicated Client Cells") codifying the dual-topology model.
3. Update `docs/model-handoff.md` and operator runbooks.

---

## 4. Key Decisions & Forks for Review

1. **Wrangler Environment Naming:**
   - *Proposal:* `afc-staging` and `afc-production` within the existing root `wrangler.toml`.
   - *Rationale:* Avoids duplicating config boilerplate and keeps build artifact bindings unified.
2. **Secrets Storage in GitHub Actions:**
   - *Proposal:* Use GitHub environment secrets with cell-specific prefix: `AFC_DIRECT_URL`, `AFC_DATABASE_URL`, `AFC_BETTER_AUTH_SECRET`, etc. within `staging` and `production` environments.
3. **Catalogue Migration:**
   - *Decision:* Clean schema bootstrap without demo catalogue data. Real catalogue data injection is scoped separately in #1330.
