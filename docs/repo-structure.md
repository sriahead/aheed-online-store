---
id: repo-structure
title: Repository Structure
audience: [dev]
type: doc
status: approved
version: "1.1.0"
updated: 2026-08-07
visibility: internal
summary: The agreed target folder layout for the Next.js + Prisma + Cloudflare app, Clean Architecture layering, and which phase scaffolds each folder.
tags: [architecture, folder-structure, conventions]
---

# Repository Structure

The recommended folder layout for the Aheed Food Centre online store — a **Next.js (App Router) +
TypeScript + Prisma** application deployed on **Cloudflare**, backed by **Neon Serverless
PostgreSQL** and **S3-compatible object storage (R2)**. It carries the **SDD** spine (constitution,
per-feature specs, enforced gates) and the **design-system** source of truth.

Nothing here is scaffolded yet — this is the agreed map; folders are created at the phases noted in
the last section. Layering follows Clean Architecture (`specs/architecture.md`): presentation →
service → repository → Prisma → Neon + object storage + Stripe, with infrastructure behind ports.

---

## Design choices baked in

- **Single Next.js app, headless API inside it.** `app/api/*` route handlers + Server Actions are
  the shared REST API — consumed by the web app now and the **future mobile app** later. If a
  dedicated backend is ever needed, `features/*`, `lib/*`, and the repository ports are the seam to
  extract.
- **Compute + edge on Cloudflare.** Workers/Pages run the app; CDN + WAF sit in front. No always-on
  origin server; scheduled work uses Cron Triggers.
- **Database is Neon (portable Postgres).** Prisma with a serverless driver adapter; the adapter and
  `DATABASE_URL`/`DIRECT_URL` are the only swap points for moving to RDS/Cloud SQL/self-hosted.
- **Object storage behind an S3-compatible port (ADR-003).** `lib/storage` wraps the AWS SDK v3 S3
  client — **no R2-specific SDK**. The DB stores **relative keys only**; the public URL is composed
  at runtime from `CDN_BASE_URL`. `public/` holds only brand/UI/placeholder images.
- **`hooks/` is reserved for SDD git hooks** (`git config core.hooksPath hooks`). React custom hooks
  live in `lib/hooks/` and feature-local `features/<x>/hooks/` — never top-level `hooks/`.
- **Design system split by intent:** `specs/design-system.md` is the authored *decision/spec*
  (gated); `design-system/` is the *implementation* (tokens as code, assets).

---

## Tree

```
aheed-online-store/
├── README.md                    # front door / SDD router
├── CHANGELOG.md                 # running history (Gate 4)
├── package.json                 # deps + scripts                     [P0/P6]
├── tsconfig.json                                                     [P6]
├── next.config.mjs                                                   [P6]
├── open-next.config.ts          # Cloudflare (OpenNext) adapter cfg  [P0]
├── wrangler.toml                # Cloudflare Workers/Pages bindings  [P0]
├── tailwind.config.ts           # imports design tokens              [P6]
├── vitest.config.ts             # test runner                        [P6]
├── eslint.config.mjs            # bans raw hex/px + raw SQL/Json      [P6]
├── .prettierrc                                                       [P6]
├── .env.example                 # env var structure (no secrets)     [P6]
├── .gitignore
│
├── hooks/                       # ── SDD GATE ENFORCEMENT (git hooks) ──   [P0]
│   ├── pre-commit               #   Gate 2: spec-before-code
│   └── pre-push                 #   Gate 4: changelog-before-merge
│
├── .github/workflows/
│   └── gates.yml                # CI gates: tests + spec + changelog  [P0, prepared]
│
├── specs/                       # ── SDD CONSTITUTION + FEATURE SPECS ──
│   ├── mission.md
│   ├── tech-stack.md            #   technical guardrails (ADR-aligned)
│   ├── roadmap.md
│   ├── architecture.md          #   system architecture + migration strategy
│   ├── design-system.md
│   ├── glossary.md              #   (lazy: on first ambiguity)
│   ├── decisions/
│   │   ├── ADR-001-hosting.md          # Cloudflare + Neon (revised)
│   │   ├── ADR-002-auth-library.md     # Better Auth
│   │   └── ADR-003-storage-abstraction.md  # S3-compatible port
│   ├── templates/feature-spec/  #   plan/requirements/validation templates
│   └── YYYY-MM-DD-<feature>/     #   per feature spec set
│
├── docs/
│   ├── onboarding.md            # 5-min start-here (+ hook install)
│   ├── repo-structure.md        # this document
│   └── user-guide.md            # end-user KMS (lazy: once a UI exists)
│
├── app/                         # ── NEXT.JS APP ROUTER: routes + API ──
│   ├── layout.tsx
│   ├── globals.css              #   imports design-system tokens
│   ├── (storefront)/            #   home · category · product · basket · checkout · account · orders
│   ├── (admin)/admin/           #   products · categories · orders · customers · discounts · loyalty · reports (RBAC-gated)
│   ├── api/                     #   HEADLESS REST API (web now, mobile later)
│   │   ├── auth/[...all]/       #     Better Auth handler
│   │   ├── products/  categories/  cart/  orders/
│   │   ├── loyalty/  discounts/
│   │   └── webhooks/stripe/     #     Stripe events (signature-verified, idempotent)
│   ├── sitemap.ts · robots.ts · manifest.ts   # SEO/PWA (mobile-ready)
│
├── components/                  # ── SHARED, REUSABLE UI (design-system impl) ──
│   ├── ui/ · product/ · layout/ · forms/       # never import Prisma or the S3 client
│
├── features/                   # ── FEATURE SLICES (domain-oriented) ──
│   ├── catalogue/ cart/ checkout/ orders/ loyalty/ discounts/ auth/ admin/
│   │   #   each slice: components/ · hooks/ · api-client · types · use-cases (services)
│
├── lib/                        # ── CROSS-CUTTING: DOMAIN PORTS + INFRA ADAPTERS ──
│   │   #   Single-adapter concerns land as a FLAT FILE (lib/db.ts), not a directory — confirmed
│   │   #   precedent across P1a (auth) and P2a (db/storage), overriding the sketch below for
│   │   #   those entries. Only lib/repositories/ is a real directory, since it genuinely holds
│   │   #   multiple per-domain files (categories.ts, products.ts, ...) — reassess payments/cache/
│   │   #   validation the same way once they're actually built, don't assume the directory shape.
│   ├── db.ts                    #   Prisma client + Neon driver adapter (DB swap point)
│   ├── repositories/            #   categories.ts, products.ts, ... — one flat file per domain
│   ├── storage.ts               #   StorageService port + S3-compatible adapter (ADR-003)
│   ├── payments/                #   PaymentService port + Stripe adapter — not built yet
│   ├── email.ts                 #   EmailService port + Resend adapter
│   ├── cache/                   #   CacheService port (Next cache / KV / Redis) — not built yet
│   ├── auth.ts, auth-rbac.ts    #   Better Auth server config, RBAC helpers
│   ├── validation/              #   zod schemas (shared client/server) — not built yet
│   ├── hooks/                   #   REACT custom hooks (NOT the SDD hooks/) — not built yet
│   ├── utils/                   #   not built yet
│   └── config.ts                #   typed, validated env parsing (single source for all *_URL/*_KEY)
│
├── database/
│   ├── seed/                    #   seed scripts + seed JSON (seed data only, not domain storage)
│   └── erd.md                   #   entity-relationship notes (Phase 7)
│
├── prisma/
│   ├── schema.prisma            #   strict relational model, provider-neutral   [P0/P7]
│   └── migrations/              #   standard portable SQL DDL (indexes, enums)
│
├── design-system/              # tokens/ components/ patterns/ pages/ assets/ guidelines/
│
├── public/                     # favicons/ · images/{brand,hero,categories} · webmanifest · robots
│   │                           #   product images are NOT here — object storage + CDN via relative keys
│
├── tests/                      # unit/ integration/ e2e/ · setup.ts   (Gate 3)
│
└── scripts/                    # bootstrap.sh (installs hooks) · seed.ts · check-gates.sh
```

---

## Why the key folders exist (changes from the previous layout)

| Folder | Why it exists |
|--------|---------------|
| `lib/db.ts` | Prisma client + **Neon serverless driver adapter**. The isolated **database swap point** (Neon → RDS/Cloud SQL/self-hosted) per `architecture.md` §4.1. Flat file, not a directory — see the note above `lib/` in the tree. |
| `lib/storage.ts` | **`StorageService` port + S3-compatible adapter (ADR-003).** Only place that imports the S3 client. The **storage swap point** (R2 → S3/GCS) per `architecture.md` §4.2. |
| `lib/repositories/` | Repository implementations behind domain-defined ports — the seam that keeps services free of Prisma. One flat file per domain (`categories.ts`, `products.ts`, ...), not a subdirectory per domain. |
| `lib/payments/` · `lib/email.ts` · `lib/cache/` | Ports + adapters for Stripe, Resend, and caching. Domain depends on the interface, not the vendor. `payments/`/`cache/` not built yet — confirm flat-file-vs-directory against actual need when they land, per the note above `lib/` in the tree. |
| `lib/config.ts` | Typed, zod-validated env parsing. **The only place** `DATABASE_URL`, `DIRECT_URL`, `S3_*`, `CDN_BASE_URL`, `STRIPE_*` are read. |
| `open-next.config.ts` · `wrangler.toml` | Cloudflare (Workers/Pages) deploy config and bindings. Replaces the previous GCP/Cloud Run deploy surface. |
| `public/` | Static brand/UI/placeholder imagery only. **Product imagery lives in object storage and is served via CDN using relative keys** — never committed, never stored as a URL in the DB. |

Everything else (`app/`, `components/`, `features/`, `design-system/`, `specs/`, `docs/`, `hooks/`,
`tests/`, `scripts/`) keeps its previous role.

---

## What is created, and when (no premature scaffolding)

- **Now (docs):** `specs/` (constitution + `architecture.md` + this structure), `docs/`, `decisions/`.
- **P0 — scaffold:** root + Cloudflare config (`open-next.config.ts`, `wrangler.toml`), `hooks/` +
  `core.hooksPath`, `.github/workflows/gates.yml`, base `app/` shell, `prisma/` init, `lib/db` (Neon
  adapter), `lib/config`, `lib/storage` (S3 port), `public/` SEO/PWA surface, `scripts/bootstrap.sh`,
  `tests/setup.ts`, `design-system/tokens/`.
- **P1 → P6 (per roadmap):** `features/*`, `components/*`, `app/(storefront|admin)/*`, `app/api/*`,
  `lib/repositories/*`, `lib/payments|email|cache` grow feature-by-feature behind their specs/gates.
- **Lazy:** `docs/user-guide.md`, `specs/glossary.md`, further ADRs.

Approve this structure and the physical skeleton (empty dirs with `.gitkeep`) can be scaffolded as
part of P0, or continue with the SDD phase sequence.
