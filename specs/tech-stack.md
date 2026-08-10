---
id: tech-stack
title: Tech Stack
audience: [dev]
type: doc
status: approved
version: "1.2.0"
updated: 2026-08-10
visibility: internal
summary: Technical guardrails for the Aheed Online Store — application, data, auth, storage, payments, email, hosting, caching, compliance, and testing choices, with the ADRs that govern where they differ from the original proposal.
tags: [tech-stack, guardrails]
related: [adr-001-hosting, adr-002-auth-library, adr-003-storage-abstraction]
---

# Tech Stack

The technical guardrails for the Aheed Online Store. Where the original proposal and the accepted
ADRs differ, **the ADRs govern** and the proposal wording is noted as superseded. The MVP is
**PostgreSQL-first, vendor-agnostic, and cost-effective**: every external dependency sits behind an
environment-configured seam.

## Application

- **Next.js** (App Router, React) with **TypeScript** — web storefront + admin.
- **Deployed on Cloudflare** (Pages/Workers via the OpenNext adapter). Edge CDN + WAF in front.
- **Tailwind CSS** — responsive UI (desktop/tablet/mobile browsers), mobile-first. English only.
- **Headless API** — Route Handlers + Server Actions serve web and admin now, and a **native mobile
  app later** without re-architecture. REST.

## Data

- **PostgreSQL** as the primary data store, provided by **Neon Serverless PostgreSQL** (autoscaling,
  scale-to-zero). Connection is standard Postgres over `DATABASE_URL` (pooled) and `DIRECT_URL`
  (direct, for migrations).
- **Prisma ORM** for schema, migrations, and access, with the serverless **driver adapter** for the
  edge/Workers connection. The adapter is the single swap point when changing Postgres providers.
- **Strict relational modelling (ADR-001, revised).** 3NF, explicit foreign keys, provider-neutral
  types. **No `Json` columns / document storage** for domain data, **no raw SQL** in application
  code, **no vendor-specific Postgres features** — so the DB migrates cleanly to AWS RDS, GCP Cloud
  SQL, Azure, or self-hosted Postgres. Money is stored as **integer pence** with explicit currency.

## Authentication & authorization (ADR-002 — Better Auth)

- **Better Auth** (MIT, self-hosted, free). Framework-agnostic, API-first, issues bearer tokens
  natively — fits the headless design, the edge runtime, and the future mobile client.
- **Methods:** Google Sign-In (OIDC) + email/password.
- **Token model:** OIDC identity → short-lived JWT access token → server-tracked rotating refresh
  token → **RBAC enforced on every route**.
- **Roles:** Customer, Staff, Admin (guests are unauthenticated and limited to browse + guest
  checkout).
- *Superseded:* the proposal's "hand-rolled JWT sessions" — we do not hand-roll auth.

## Object storage (ADR-003 — S3-compatible abstraction)

- **Cloudflare R2**, accessed **only through the standard S3-compatible API** (AWS SDK v3 S3
  client). **No R2-specific SDK or feature.**
- All images and large files live in object storage behind an **abstracted `StorageService`**
  (port/adapter). The database stores **relative keys only** (e.g. `products/{sku}/main.webp`),
  **never full URLs**; the CDN base is resolved at runtime from `CDN_BASE_URL`.
- Switching to AWS S3, GCP Cloud Storage, MinIO, or any S3-compatible provider requires **only env
  changes** (`S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_REGION`,
  `CDN_BASE_URL`) plus an object copy — no code or DB-row changes.

## Payments

- **Stripe** for all card processing, behind a `PaymentService` port (`lib/payments.ts`, created in
  P3b). Card data never touches Aheed's servers — PCI scope is minimised to Stripe. Webhooks are
  signature-verified and idempotent.
- **Hosted Stripe Checkout**, not embedded Elements — it handles UK **Strong Customer
  Authentication / 3-D Secure**, a legal requirement rather than a nicety (ADR-005). Elements stays
  a later swap behind the same port.
- **Money flow is multi-vendor-aware (ADR-005):** all vendors settle into a **single platform Stripe
  account** today, with a Connect-ready seam (`vendorId` on the payment input) so per-vendor payouts
  are additive. Note the consequence: the platform is the **merchant of record** for every vendor's
  sales — revisit before onboarding a real third-party merchant.
- **The Stripe adapter is real as of P3c** (`lib/payments.ts`): hosted Checkout sessions created with
  raw `fetch` (no `stripe` SDK — same Worker-bundle reasoning as aws4fetch/Resend), confirmed by a
  signature-verified idempotent webhook at `/api/webhooks/stripe`. P3b's **stub is retained as the
  fallback** whenever `STRIPE_SECRET_KEY` is unset, so local dev and CI need no Stripe setup.
- **Webhook signatures are verified with WebCrypto** (HMAC-SHA256 over `{timestamp}.{rawBody}`,
  constant-time compared, 5-minute replay tolerance) — no library, and the *raw* body is used because
  re-serialising parsed JSON breaks the signature.

## Email

- **Resend** — transactional email (order confirmation, delivery-status notifications), behind an
  `EmailService` port so it can be swapped for SES/SendGrid.

## Hosting & infrastructure (ADR-001 — revised: Cloudflare + Neon)

- **Cloudflare** for compute and edge — Next.js on Workers/Pages, CDN + WAF for all traffic.
- **Cloudflare R2** for images via the S3 API — **zero egress**.
- **Neon Serverless PostgreSQL** as the database origin (no co-located compute needed; connection is
  serverless-native over the pooled endpoint).
- **Secrets** via Cloudflare environment/secret bindings; typed and validated in `lib/config`.
- **Observability** via Cloudflare analytics/logs plus application logging; alerting on error rate
  and latency.
- **Scheduled tasks** via Cloudflare Cron Triggers where required.
- *Portability note:* every provider above is reachable through a port + env config, so the origin
  can move to Node/containers on AWS/GCP and the DB/storage to RDS+S3 or Cloud SQL+GCS without
  touching domain code. See `specs/architecture.md` §4.

## Caching & performance

- Next.js Data Cache / ISR for catalogue and product pages (framework-native, portable).
- Optional edge KV for hot reads behind a `CacheService` port (KV ↔ Redis swap); DB remains source
  of truth.
- **Keyset (cursor) pagination** for all growable lists; composite indexes shipped with each
  query-heavy feature; explicit `select`/`include`; transactions for multi-table writes.
- Targets (Gate-3 criteria): storefront LCP < 2.5s on 4G, API p95 < 400ms, ~1,000 orders/day.

## Compliance (UK)

UK GDPR / Data Protection Act 2018, PECR cookie consent, Consumer Contracts Regulations 2013,
PCI-DSS (via Stripe), SSL/HTTPS everywhere, accessibility best practice. T&Cs and Privacy Policy
pages require final review by Aheed's solicitor.

## Testing & quality

- **Vitest** as the test runner (TS/Next.js stack).
- **ESLint** + **Prettier** — linting and formatting; a lint rule bans raw hex/px in components and
  raw SQL / `Json` domain columns in review.
- **Husky** git hooks via `core.hooksPath hooks` — local gate enforcement.
- **GitHub** for source control; **GitHub Actions** CI + branch protection prepared for later.

## Conventions

- Spec before code; validation before done; changelog before merge.
- One feature per branch; one approved spec per implementation.
- Clean Architecture, SOLID, API-first thinking; reusable components; simplicity over cleverness.
  Build only what the current stage requires.
- Program to ports, not concretions; config only through validated env; storage keys not URLs.

## Referenced decisions

- `specs/decisions/ADR-001-hosting.md` (revised — Cloudflare + Neon)
- `specs/decisions/ADR-002-auth-library.md`
- `specs/decisions/ADR-003-storage-abstraction.md` (S3-compatible port)
- `specs/architecture.md` (full system architecture + migration strategy)
