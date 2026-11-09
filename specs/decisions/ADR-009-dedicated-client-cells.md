---
id: adr-009-dedicated-client-cells
title: "ADR-009 — Platform Cell and Dedicated Client Cells: Runtime Isolation, Lockstep CI & Data Autonomy"
audience: [dev, architect, operations]
type: adr
status: approved
version: "1.0.0"
updated: 2026-11-09
visibility: internal
summary: "Architecture decision codifying dual topology: multi-tenant platform cell for marketplace stores alongside dedicated client cells (starting with Aheed Food Centre) with separate Workers, Neon databases, and R2 buckets, deployed in lockstep by CI."
tags: [adr, cells, multi-tenancy, database-isolation, cloudflare-workers, neon]
related: [adr-001-hosting, adr-004-multi-tenancy, architecture]
---

# ADR-009 — Platform Cell and Dedicated Client Cells: Runtime Isolation, Lockstep CI & Data Autonomy

Owner approval: 2026-10-29 / 2026-11-09, issue `#1331` (Parent: `#1337`).

---

## 1. Context

ADR-004 established multi-tenant isolation within a shared database, separating tenants by `vendorId`. However, certain enterprise clients and independent business operations (beginning with Aheed Food Centre trading at `aheedfoodcentre.co.uk`) require **strict physical database isolation**, autonomous data retention, and dedicated Cloudflare edge resources.

Three runtime facts constrain the isolation model:
1. **One Database Connection Pool Per Isolate:** Under Next.js on Cloudflare Workers via `@opennextjs/cloudflare` with `@prisma/adapter-neon`, connection pooling occurs at isolate initialization. Dynamic database switching per request was evaluated and rejected: opening multiple connection pools or dynamically instantiating clients per request exhausts isolate socket limits, causes query latency spikes, and introduces cross-tenant leakage hazards.
2. **Codebase & Schema Uniformity:** Managing separate repositories or forking schemas for dedicated clients would eliminate economies of scale, create maintenance debt, and lead to divergent feature sets.
3. **CI/CD Drift Risk:** Deploying cells through decoupled or uncoordinated pipelines creates silent version skew where one client runs on a stale schema or outdated business logic.

---

## 2. Decision 1 — Cell-Based Deployment Topology

Isolation between businesses is achieved through **Cells**:
- **Platform Cell (ShopLocal):** Multi-tenant cell (`shoplocal.merqify.com`) on Neon `Shoplocal Staging` and `Shoplocal`. Houses multi-tenant marketplace vendors (e.g. SriMart, platform demos) isolated by `vendorId` per ADR-004.
- **Dedicated Client Cells (e.g. Aheed Food Centre):** Physical isolation where the business receives:
  - Its own Cloudflare Workers (`afc-store-staging` / `afc-store-production`).
  - Its own Neon Postgres projects (`Aheed Food Centre Staging` / `Aheed Food Centre`).
  - Its own R2 image buckets (`afc-images-staging` / `afc-images-production`).
  - Its own environment secrets (`AFC_DIRECT_URL`, `AFC_DATABASE_URL`, etc.).

---

## 3. Decision 2 — Shared Platform Foundations

Every cell shares:
- The single unified application codebase and Next.js / OpenNext build output.
- The Cloudflare Workers Paid plan account container.
- The read-only `uk-location-reference` database (which contains solely public UK postcode/geographic reference data and zero tenant data).

---

## 4. Decision 3 — Lockstep CI/CD Deployment

All cells must be deployed in **lockstep** within a single GitHub Actions workflow run:
1. OpenNext compiles the application bundle exactly once per commit (`opennextjs-cloudflare build`).
2. Schema migrations (`prisma migrate deploy`) execute sequentially across the platform database (`DIRECT_URL`) and each dedicated cell database (`AFC_DIRECT_URL`).
3. Route verification checks run for each cell's route table against its live database.
4. Workers, schedulers, and inbound-email workers deploy sequentially across all cells.
5. If any cell fails migration or deployment, the entire workflow halts, preventing drift.

---

## 5. Decision 4 — Custom Domain Ingress via Cloudflare for SaaS

A dedicated cell connects to client domains (`staging.aheedfoodcentre.co.uk`, `www.aheedfoodcentre.co.uk`) via Cloudflare for SaaS custom hostnames mapped to the dedicated Worker, allowing the client to maintain independent DNS while leveraging platform edge infrastructure.

---

## 6. Consequences

### Positive
- **Guaranteed Physical Isolation:** Independent businesses have zero co-mingling of customer records, orders, or payment references in the database.
- **Zero Schema Drift:** All cells share the identical schema version and application code at all times.
- **Operational Scalability:** Adding new dedicated enterprise clients follows a documented, repeatable SOP (`afc-*`, `client2-*`) without rewriting repository services.

### Trade-offs & Mitigations
- **Deployment Duration:** Deploying multiple workers increases CI deployment execution time by ~30–45s per cell. Mitigated by sequential deployment ordering after a single shared build step.
- **Secret Management:** Requires dedicated environment secrets (`AFC_*`). Mitigated by standardized naming conventions and automated route verification guards.
