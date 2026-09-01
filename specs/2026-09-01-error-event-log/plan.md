---
id: error-event-log-plan
title: "Database-backed error event log for the global error boundary (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-09-01
visibility: internal
summary: "A platform-ADMIN-only staff page and a new ErrorEvent table give operations a queryable root cause for any thrown error, independent of Cloudflare Workers Logs — closes #508."
tags: [observability, error-handling, admin, database]
related: [roadmap, error-boundary-gaps-plan]
---

# Database-backed error event log for the global error boundary (plan)

**Goal:** when a visitor hits the generic "Something went wrong" page, an operator can find the
real error (message, stack, route, timestamp) in this app's own database within seconds — no
Cloudflare dashboard login, no `wrangler tail`, no dependency on #246 (still open, still unconfirmed)
ever being resolved.

## Background

`app/error.tsx`/`app/global-error.tsx`/the two route-group error boundaries (#480, #478, #479)
correctly show visitors a generic message with zero error detail — `components/errors/ErrorPanel.tsx`
"never receives the error object at all... not as a prop, not for a 'details' toggle," a deliberate
rule written after #430 (a misconfigured production key throwing a Zod issue list that named
environment variables). That rule is **not touched by this slice** — see Deliberately excluded.

`instrumentation.ts`'s `onRequestError` hook (also #480, its R7) already runs server-side for every
request whose render/route/action throws, with the real, unredacted error — before Next.js reduces
it to a generic message + digest for the client boundary. Today it only does `console.error(...)`,
which reaches Cloudflare Workers Logs — a pipeline **#246** has never confirmed is actually
queryable from this team's environment (`wrangler tail` fails with `fetch failed` from every
environment tried so far, most recently 2026-09-01). This slice adds a second capture path that
doesn't depend on Cloudflare's log retention at all.

## Scope (this slice)

- **`prisma/schema.prisma`** gains `ErrorEvent` — no vendor relation, mirroring `HealthCheck`'s
  existing precedent for a genuinely platform-wide table (`id`, `digest` nullable, `message`,
  `stack` nullable, `path`, `method`, `routerKind`, `routeType`, `createdAt`), `@@index([createdAt])`.
  One additive migration.
- **`lib/repositories/error-events.ts`** (new) — pure functions taking an explicit Prisma client,
  matching every other file in `lib/repositories/*` and covered for free by the existing,
  filesystem-walked `tests/repository-purity.test.ts` / `tests/repository-client-injection.test.ts`:
  - `normalizeCaughtError(error: unknown)` — `onRequestError`'s `error` parameter is typed
    `unknown`, not `Error`; this extracts `message`/`stack`/`digest` safely regardless of what was
    actually thrown.
  - `recordErrorEvent(prisma, input)` — writes one row. Truncates `message`/`stack` before insert
    (an unbounded stack from a pathological recursive error should not become an unbounded row) and
    **strips the query string from `path`** unconditionally, in this function, not left to the
    caller to remember — a GET route carrying a value in its query string (email, a search term)
    must never land in a log table by accident.
  - `listRecentErrorEvents(prisma, limit)` — most recent rows, `createdAt desc`.
- **A retention sweep, matching an existing pattern rather than inventing a new one.**
  `lib/repositories/order-lookup-rate-limit.ts` already carries exactly this shape
  (`SWEEP_PROBABILITY` chance of a `deleteMany` on every write, added by **#468** after an identical
  table shipped with no sweep and grew unbounded). `recordErrorEvent` copies it: low-probability
  `deleteMany` of rows older than 30 days. This is a **deliberate deviation from #508's proposal**,
  which said "no retention job in this first cut" — found during Spec research that the codebase
  already paid for this exact lesson once (#468) and the fix is one constant and one `if`, so
  repeating the mistake here would be knowingly reintroducing something already fixed elsewhere.
- **`lib/db.ts`** gains `getPrismaUncached()` — a fresh `PrismaClient` (via `PrismaNeonHttp`) on
  every call, deliberately **not** wrapped in React's `cache()` the way `getPrisma()`/`getPrismaWs()`
  are. See "Why an uncached client" below — this is the slice's one real technical risk.
- **`instrumentation.ts`'s `onRequestError`** calls `recordErrorEvent` (via `getPrismaUncached()`)
  with the normalized error plus `path`/`method`/`routerKind`/`routeType`, **in addition to** its
  existing `console.error(...)` call, which is unchanged — this slice adds a second, independent
  capture path rather than replacing the first. The DB write is wrapped in its own `try`/`catch`: a
  failure there logs a distinct `console.error` and never propagates, so a database outage degrades
  this feature to exactly today's behaviour rather than affecting the error page a visitor sees.
- **A new staff page**, `app/(admin)/staff/errors/page.tsx`, listing the most recent `ErrorEvent`
  rows. Gated to **platform ADMIN only** — `requireVendorRole("ADMIN")` succeeding is not enough by
  itself; the page additionally requires `auth.via === "platform-admin"`, refusing (via the existing
  `PanelRefusal` component) a per-vendor store admin who would otherwise pass the vendor-role check.
  Decided at `/propose`: stack traces can reveal internal file paths and implementation details a
  vendor-scoped account has no legitimate reason to see.

## Why an uncached client

`getPrisma()`/`getPrismaWs()` are wrapped in React's `cache()`, which de-dupes a call **within one
render's request scope** — the mechanism that keeps this app's Prisma clients from becoming the
cross-request singleton `CLAUDE.md` already documents as a P1 incident ("Cannot perform I/O on
behalf of a different request", ~1-in-3 rapid sequential requests). `onRequestError` is not a
Server Component render; whether it executes inside an active `cache()` scope under this app's
specific Next 16 / OpenNext / Cloudflare Workers stack is **unconfirmed**, and this repo has a
documented history of Next-on-Workers behaviour not matching framework-documented semantics
(`proxy.ts`, `edge` runtime, `@prisma/client/wasm` resolution — all in `CLAUDE.md`). Rather than
gamble on `cache()` doing the right thing in a calling context it was arguably never designed for,
`getPrismaUncached()` sidesteps the question entirely: a plain, uncached client construction is
correct in every context, request-scoped or not, at the cost of one extra Prisma client per error
(errors are not a hot path).

## Deliberately excluded

- **Anything reaching `ErrorPanel` or the four boundary files.** `components/errors/ErrorPanel.tsx`
  deliberately receives no error information at all today, not even the digest — a rule written
  after a real incident (#430) and re-affirmed at #478/#479. This slice does not reopen that
  decision; a visitor's page is byte-for-byte unchanged. Consequence: an operator cannot correlate a
  specific visitor's report to a specific `ErrorEvent` row by digest, because the visitor never sees
  one. They correlate by **route + approximate time** instead, which is what the list page's columns
  are for. Reopening digest visibility, if ever wanted, is its own `/propose`.
- **Pagination on the staff page.** Newest 50 rows, no cursor, no page 2. This is a debugging tool
  for "what just broke," not a searchable archive; add pagination later if 50 stops being enough,
  behind its own small slice.
- **Alerting.** #437 (critical production alerting) is push (get notified something broke); this
  is pull (look up why, once you already know). #437 can alert on this table's write rate later if
  useful, but this slice doesn't build that, and doesn't depend on #437 either.
- **Confirming #246** (whether Cloudflare Workers Logs are actually queryable). This slice is
  deliberately independent of that outcome — it works whether or not #246 is ever resolved.
- **Any schema/UI change for filtering, searching, or exporting error events.** Read-only list,
  newest-first, nothing else.

## Open items carried forward

- **The Cloudflare-context risk under `onRequestError`** (see "Why an uncached client") is mitigated
  by design, not proven — `getPrismaUncached()` removes the specific `cache()` failure mode, but
  whether `onRequestError` has *any* usable request/environment context at all for
  `lib/config.ts`'s `getCloudflareContext()`/`readEnv()` to resolve `DATABASE_URL` from is still
  something only a live `npm run preview` run (forcing a real throw) can answer. If it turns out
  `onRequestError` has no such context, `getEnv()` falls through to `process.env` (see
  `lib/config.ts`), which is empty on a real Worker outside a request — the write's own `try`/`catch`
  is what keeps that failure silent and harmless rather than surprising. Flagged at `/propose`;
  resolving it live is this slice's own R14/R15 (see `validation.md`), not a follow-up issue.
