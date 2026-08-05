# ADR-001 — Hosting, Database & Egress

- **Status:** Accepted (revised). This revision **supersedes** the original GCP-origin design
  (Cloud Run + Cloud SQL behind Cloudflare) in favour of an all-serverless, vendor-agnostic origin.
- **Date:** superseding revision.
- **Related:** ADR-002 (auth), ADR-003 (storage abstraction), `specs/architecture.md`.

## Context

The store must be **PostgreSQL-first, vendor-agnostic, and cost-effective**, mobile-first, and sized
for ~1,000 orders/day. The original design co-located API compute (Cloud Run) with the database
(Cloud SQL) on GCP to control egress, with Cloudflare only at the edge. That works but keeps an
always-on origin, ties us to one cloud's compute + managed DB, and adds operational surface.

## Decision

Adopt an **all-serverless origin with a portable data tier**:

- **Compute + web + API:** Next.js on **Cloudflare** (Pages/Workers via the OpenNext adapter).
  The API is standard Route Handlers + Server Actions.
- **Database:** **Neon Serverless PostgreSQL**, accessed via Prisma with a serverless driver
  adapter. Standard Postgres wire protocol; connection strings in `DATABASE_URL` (pooled) and
  `DIRECT_URL` (migrations).
- **Images:** **Cloudflare R2** via the S3-compatible API (see ADR-003) — **zero egress**.
- **Edge:** Cloudflare CDN + WAF for all traffic.

Co-location is no longer required: Neon's serverless endpoint is reached over its HTTP/WebSocket
driver, so there is no egress penalty from separating compute and DB, and no idle compute bill.

## Portability guardrails (why this is not lock-in)

- **DB:** only standard Postgres features and Prisma queries — migratable to AWS RDS, GCP Cloud SQL,
  Azure, or self-hosted by swapping `DATABASE_URL`/`DIRECT_URL` and the driver adapter (isolated to
  `lib/db`). See `architecture.md` §4.1.
- **Origin:** the app is standard Next.js; if the edge runtime ever constrains us, it runs on
  Node/containers unchanged.
- **Storage:** S3 API only, keys not URLs (ADR-003) — migratable to S3/GCS by env change + object
  copy. See `architecture.md` §4.2.

## Consequences

- **Positive:** near-zero idle cost (scale-to-zero DB + per-request compute), zero image egress,
  simple ops, and a genuinely portable data tier proven by the migration plans in `architecture.md`.
- **Trade-offs:** the edge runtime requires the Prisma driver adapter and serverless-friendly
  connection pooling; long-running/background work uses Cron Triggers/queues rather than a persistent
  server. Both are accepted and abstracted.
- **Superseded:** original ADR-001 "Option A" (GCP Cloud Run + Cloud SQL origin) and the
  co-location rule. Original "Option B" (fully Cloudflare-native serverless Postgres) is subsumed by
  this decision using Neon as the portable Postgres.
