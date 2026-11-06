---
id: tech-stack
title: Tech Stack
audience: [dev]
type: doc
status: approved
version: "1.8.0"
updated: 2026-11-06
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
- **Browser floor: Safari / iOS 15.4** (`#1445`, `specs/2026-11-06-ios15-safari-compat/`). Other
  engines keep Next.js 16's defaults (Chrome, Edge and Firefox 111). `package.json` `browserslist`
  is `chrome >= 111`, `edge >= 111`, `firefox >= 111`, `safari >= 15.4`, `ios_saf >= 15.4`.
  - **Without it, Next compiles for Safari 16.4.** The App Router chunk then ships a class static
    block, iOS 15 cannot parse it, and nothing on the page can be clicked. The build stays green.
  - **Why 15.4, not 15.0:** Tailwind v4 wraps its whole stylesheet in `@layer` (cascade layers, Safari
    15.4), and Next's App Router calls `structuredClone` unguarded (Safari 15.4). An iPhone 6s
    updates to iOS 15.8.
  - **Guard:** the `postbuild` script `scripts/check-client-syntax.ts` parses every `.next/static`
    `.js` file with **`acorn` 8.18.0 (exact-pinned devDependency, MIT)**. It fails the build on a
    static block, a regex lookbehind literal or a regex `v` flag. OpenNext runs `npm run build`, so
    both deploys run it. `tests/browser-support.test.ts` pins the targets, the hook and the acorn
    version. The guard checks syntax only; a runtime API newer than 15.4 is not caught.
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

- **Cloudflare R2**, accessed **only through the standard S3-compatible API** — signed with
  `aws4fetch`, not the AWS SDK v3 S3 client, for Worker bundle size. **No R2-specific SDK or
  feature.**
- All images and large files live in object storage behind an **abstracted `StorageService`**
  (port/adapter). The database stores **relative keys only** (e.g.
  `products/{productId}/{uuid}.webp`), **never full URLs**; the CDN base is resolved at runtime from
  `CDN_BASE_URL`. **Product image keys are immutable** — a replacement writes a new key rather than
  overwriting, so no CDN purge is ever needed (P6b2).
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

## Staff alerts

- **Telegram Bot API** (`#1390`), the free, official route: one platform bot, token in the Worker
  secret `TELEGRAM_BOT_TOKEN` (optional; unset means alerts skip). It sits behind the
  `OrderAlertChannelAdapter` port in `lib/order-alert/`, with recipients per vendor and channel in
  `VendorOrderAlertRecipient`. Alerts are plain text carrying the store name, order number, sender
  name, subject and route only. A message body, email address or phone number is never sent.
- **WhatsApp** is a later adapter on the same port (`#1424`, Meta Cloud API with a utility
  template), not a replacement. Unofficial WhatsApp gateways are ruled out: they break WhatsApp's
  terms and the number can be banned.

## Hosting & infrastructure (ADR-001 — revised: Cloudflare + Neon)

- **Cloudflare** for compute and edge — Next.js on Workers/Pages, CDN + WAF for all traffic.
- **Cloudflare R2** for images via the S3 API — **zero egress**.
- **Neon Serverless PostgreSQL** as the database origin (no co-located compute needed; connection is
  serverless-native over the pooled endpoint).
- **Secrets** via Cloudflare environment/secret bindings; typed and validated in `lib/config`.
- **Observability** via **Workers Logs**, configured in `wrangler.toml`'s top-level
  `[observability]` block (`enabled = true`, `head_sampling_rate = 1` — 100% of requests, right at
  today's pre-launch volume and due to come down before launch rather than be removed). The block
  is inheritable, so `staging` and `production` both pick it up. Live `wrangler tail` streams
  regardless of this setting; what the block adds is *persisted*, queryable logs. Added in P7d
  (#218) — before it, no server-side latency measurement was possible at all, while
  `specs/mission.md` had been setting API `p95 < 400ms` as a Gate-3 criterion since the start.
  **Alert routing on error rate and latency is P8's**, not this line's — see `specs/roadmap.md`.
- **Scheduled tasks** via Cloudflare Cron Triggers where required.
- *Portability note:* every provider above is reachable through a port + env config, so the origin
  can move to Node/containers on AWS/GCP and the DB/storage to RDS+S3 or Cloud SQL+GCS without
  touching domain code. See `specs/architecture.md` §4.

## Caching & performance

- ~~Next.js Data Cache / ISR for catalogue and product pages (framework-native, portable).~~
  **This does not hold on this stack and never did** — corrected in P7d (#218). Next's SSG-based
  ISR has to prerender in plain Node, but Prisma here loads via `@prisma/client/wasm`, which only
  runs in the Workers runtime; attempting it hard-fails the build (`Unknown file extension
  ".wasm"`), found while shipping P2a. Catalogue and product pages are `force-dynamic`.
  `specs/architecture.md` §3.4 has recorded this since P2a — **this file kept asserting the
  opposite**, so whichever doc a reader opened first decided what they believed. See §3.4 for the
  caching options that do apply (edge KV behind a `CacheService` port; Cloudflare's edge cache in
  front of the Worker).
- Optional edge KV for hot reads behind a `CacheService` port (KV ↔ Redis swap); DB remains source
  of truth.
- **Cloudflare KV holds the job activity markers** (`#1324`): the `JOB_SIGNALS` namespace lets the
  scheduler skip a job, and so skip waking Neon, when there is nothing to do. It is reached only
  through `lib/job-signals.ts`, and an absent or failing KV fails open to running the job. It is not a
  cache and holds no domain data. See `specs/architecture.md` §3.4.
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
- **GitHub** for source control; **GitHub Actions** CI. **Branch protection is live, not "prepared
  for later"** (that phrasing stood here until `#644`, 2026-09-07): two active repository rulesets,
  `protect-main` and `protect-staging`, each carrying `pull_request`, `non_fast_forward`, `deletion`
  and `required_status_checks` (requiring `docs-gates`, `quality / kms`, `quality / quality`). Both
  still set `required_approving_review_count: 0`, so an author can self-merge — but no longer with
  red checks, and no longer without a PR. Query rulesets with
  `gh api repos/sriahead/aheed-online-store/rulesets`; the classic
  `/branches/<b>/protection` endpoint returns `404` regardless and cannot see them.

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

## Dependency & version discipline

Moved here from `CLAUDE.md` in #786, which now carries the short form (exact-pin the DB drivers and
adapters, never `npm audit fix --force`, never absorb a breaking major as a side effect) and a
pointer to this section. The version-adjacent failures these policies exist to prevent —
Turbopack's resolver, the `proxy.ts` incompatibility, ESLint 9 flat config, the live-DB test guard
— are in `docs/developer-portal/runtime-pitfalls.md`.

- **Icon data (#1223, ADR-008): four exact-pinned `devDependencies`.** `@iconify/utils` 3.1.7 (MIT),
  `@iconify-json/lucide` 1.2.122 (ISC), `@iconify-json/ph` 1.2.2 (MIT, Phosphor) and
  `@iconify-json/noto` 1.2.9 (Apache-2.0, Noto Emoji). `scripts/build-icons.ts` reads them at build time
  and commits only the icons `components/icons/registry.ts` names, so none of them reaches the Worker or
  a browser. They are pinned because that committed output is derived from them, and
  `@iconify-json/lucide` is held at the release whose artwork matches the installed `lucide-react`
  (`tests/icon-lucide-parity.test.ts` fails on any drift). **Sets licensed Creative Commons Attribution
  (Streamline, Solar, Twemoji) are excluded unless the owner approves a visible credit.** There is no
  runtime Iconify dependency and none may be added: `@iconify/react`, the Iconify API and CSS-mask
  plugins are rejected in ADR-008, and the CSP would block the API.
- **Spreadsheet reading for catalogue imports (#1216): `@e965/xlsx` 0.20.3, exact-pinned, a
  `devDependency`, Apache-2.0.** It is the one package that reads `.xls` (legacy BIFF), `.xlsx` and
  `.csv` for `scripts/import-catalogue.ts`. It has no dependencies and `npm audit` reports no
  advisory for it. **Provenance caveat:** it is a community republication of SheetJS (`xlsx` on npm
  stopped at 0.18.5, which carries known advisories; the maintained builds are served from SheetJS's
  own CDN, not npm), so it is exact-pinned and listed in `tests/dependency-pins.test.ts`. It may be
  imported **only from `scripts/lib/read-spreadsheet.ts`**, so it can never reach the Worker bundle
  (`tests/catalogue-import-guards.test.ts`). Replacing it means re-running the parse tests, which
  generate all three formats with the package under test.
- **Exact-pin infrastructure-adjacent packages** — DB drivers, adapters, runtime types. Their
  declared semver ranges are looser than real compatibility. **Locked today, and enforced by
  `tests/dependency-pins.test.ts`:** `@neondatabase/serverless` = **1.1.0 exact**,
  `@prisma/adapter-neon` = **7.9.1 exact**, `@prisma/client` = **6.19.3 exact**. All three are
  declared with no range operator, and that test asserts both halves — the installed version *and*
  the absence of a caret — because checking only the version passes right through a re-loosened pin
  that happens to still resolve correctly today.
  **These were raised from `0.10.4` / `^6.19.3` in commit `ac3f0d6` (2026-08-14), deliberately, as
  part of the Cloudflare connection-exhaustion fix** that introduced `lib/db.ts`'s hybrid
  `getPrisma()`/`getPrismaWs()` strategy. That commit updated this file's hybrid-driver section but
  not this paragraph, so for three weeks the pins documented here had not existed since mid-August —
  and because both became **caret** ranges, `npm install` could have moved them again at any point.
  Found by hand at `#489`'s `/spec`, ratified rather than reverted in `#491`; the versions have
  production behind them and reverting would have undone half of a real fix.
  **`@prisma/adapter-neon` is a full major ahead of `@prisma/client` (7.x against 6.19.3). That is
  deliberate, known, and tracked by `#560`** — not an oversight to "correct" by bumping one of them.
  Nothing in the toolchain can warn about it: adapter-neon@7 declares **no `peerDependencies` at
  all** (it takes `@prisma/driver-adapter-utils` at an exact `7.9.1` and `@neondatabase/serverless`
  at `>0.6.0 <2`), so npm has nothing to check the client version against. The pin test is the only
  thing that makes the pairing unable to change silently.
  `@cloudflare/workers-types` is **not** exact-pinned and is **not** covered by that test — it is
  types-only, on date-based versioning, and ships no runtime behaviour. Its majors do **not** track
  wrangler's, whatever this line used to claim: the observed working pairing today is
  `@cloudflare/workers-types` **5.x** (`5.20260804.1`) with `wrangler` **4.x** (`4.119.0`). Record
  what is observed here rather than asserting a rule; `#491` found the old "must match wrangler's
  major (v5)" sentence was false in both halves.
  **`prisma` (the CLI/generator) is still `^6.19.3` and floats.** `npm ci` pins it via the lockfile
  so CI is unaffected, but a local `npm install`/`npm update` can drift the generator away from the
