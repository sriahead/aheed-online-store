---
id: rate-limit-hardening
title: "Rate-limit hardening: retention sweep and fail-closed vendor resolution (plan)"
audience: [dev]
type: spec
status: approved
version: "1.0.0"
updated: 2026-08-31
visibility: internal
summary: Adds an opportunistic retention sweep to both Postgres-backed rate limiters, makes the auth throttle fail closed instead of silently skipping when no vendor resolves, fixes its sensitive-path list, adds the migration it never had, and wires its hook the way Better Auth actually invokes it — closing #468, #469, #481, #482, and #483, and making the rate limiter added by #431 function for the first time since it shipped.
tags: [security, auth, rate-limiting, p9]
related: [roadmap]
---

# Rate-limit hardening: retention sweep and fail-closed vendor resolution (plan)

Five defects in P9.1's rate-limiting work (#431). #468 and #469 were filed during `/orient` on
2026-08-30 while re-validating that phase's own roadmap rows. **#481, #482, and #483 were all found
live at `/build`, 2026-08-31**, in that order, each one surfacing while confirming the fix for the
previous one actually worked end to end — see their own sections below. Each is fixed in this same
slice by user decision (a separate `AskUserQuestion` for each), since each is the identical small
area of code (the same five-line path list, the same missing table, the same misplaced config key)
already being edited for the issue before it, not a new area. **Together, #481+#482+#483 mean the
auth rate limiter added by #431 has never functioned at all, for three independent, compounding
reasons, since it shipped to production on 2026-08-29** — this slice is what makes it work for the
first time, not merely hardens an already-working control. All five close here as their own small
slice — the same shape as `specs/2026-08-31-error-boundary-gaps/`, which fixed #459's gaps two days
before. None needs a new Project #2 board phase: the Phase field's ceiling is `P8` (no `P9` option
exists; see #267), so this slice stays tagged `P8` like every other P9.1/P9.2 follow-up, and closes
on merge like #467/#478/#479 did.

**Goal:** stop `AuthenticationAttempt`/`OrderLookupAttempt` growing without bound, stop the auth rate
limiter silently admitting unthrottled traffic when tenant resolution fails, and make the rate
limiter actually run, against a real table, on the real endpoints it was built to protect — verified
live end to end, not just individually.

## #468 — unbounded growth

`checkAuthRateLimit`/`checkOrderLookupRateLimit` (`lib/repositories/*-rate-limit.ts`) write one row
per allowed request and never delete any. Confirmed live in this repo (`git grep authenticationAttempt`
finds only the `count`/`create` pair) — there is no retention sweep, no TTL, no cron.

**Scope (this slice):**
- Both repository functions gain an opportunistic sweep: on a small random fraction of allowed
  requests, `deleteMany({ where: { createdAt: { lt: <now - retention> } } })` against the same
  Prisma client already passed in. `deleteMany` is confirmed safe on the HTTP adapter (`getPrisma()`)
  per `CLAUDE.md` — unlike `updateMany`/`createMany`, which crash unconditionally over HTTP — so this
  needs no `getPrismaWs()` and no request-shape change.
- Retention window and sweep probability are named constants (`RETENTION_MS`, `SWEEP_PROBABILITY`)
  in each file, not magic numbers. Retention only has to exceed the existing 60-second rate-limit
  window; this slice uses 1 hour, matching the issue's own "anything from an hour to a day is
  generous."
- The two rate-limit tables already carry `@@index([vendorId, ipHash, createdAt])` (confirmed by
  reading `prisma/schema.prisma`), which answers #468's own open question about index coverage for
  the `count` query. The sweep's `deleteMany` filters on `createdAt` alone (across every vendor/IP,
  by design — the whole table's stale rows, not one tenant's), which this composite index does not
  cover as efficiently as a dedicated `createdAt` index would. **Deliberately not adding one in this
  slice**: at current and near-term traffic (pre-launch; mission.md's ~1,000 orders/day target is
  still ahead) the table stays small enough between sweeps that a sequential scan over the stale rows
  costs nothing measurable, and adding an index is a migration this narrow fix doesn't need to carry.
  Revisit if `#468` or a launch-readiness pass ever measures this query showing up in slow-query logs.

**Decision made and confirmed with the user (2026-08-31):** an opportunistic in-request sweep over a
Cloudflare Cron Trigger. A cron is cleaner in principle but is new infrastructure per `CLAUDE.md`'s
hard stop — its own `wrangler.toml` wiring, its own deploy/testing surface, arguably its own
`/propose` — for what this slice treats as a small hygiene fix, not new infrastructure.

## #469 — auth rate limit fails open when no vendor resolves

`lib/auth.ts`'s `onRequest` hook wraps the rate-limit check in `if (vendorId) { ... }` with no `else`
— when `getCurrentVendorIdOrNull()` returns `null`, the block is skipped and the request proceeds
unthrottled to Better Auth's real handler.

**This is a confirmed exploitable bypass, not a cosmetic gap** — the open question #469 itself left
unresolved. `User.email` is globally unique (`prisma/schema.prisma`) and unscoped from tenant
resolution; `VendorMembership` is a separate join table used only for staff/admin roles. Better
Auth's `/sign-in/email` handler checks credentials against the full `User` table regardless of which
vendor (if any) the request's `Host` resolved to. `getCurrentVendorIdOrNull()`
(`lib/tenant.ts`) returns `null` precisely when the `Host` header matches no `VendorDomain` row and
two or more vendors are active — true today in principle (Aheed + SriMart, ADR-004) once both are
seeded in an environment, and reachable by any request whose `Host` doesn't match a configured
domain (a still-enabled `*.workers.dev` default route, a direct IP hit, or any other unmatched
value). So a request with an unmatched `Host` skips the throttle entirely while still reaching real
password verification against any account on the platform — an unauthenticated brute-force path
around the one control P9.1 added for this.

**Scope (this slice):**
- `lib/auth.ts`'s inline `onRequest: async (req) => { ... }` closure is hoisted into two standalone
  exports — `isSensitiveAuthPath(pathname): boolean` (the five-path check) and
  `authOnRequest(req): Promise<Response | undefined>` (the full hook body) — the same pattern this
  file already uses for `buildSocialProviders`/`authDb` (both pulled out of `getAuth()`'s inline
  config for exactly this reason: testability without a live Prisma/Workers context). `getAuth()`'s
  config becomes `onRequest: authOnRequest`.
- `authOnRequest` refuses outright (`429`, matching Better Auth's existing rate-limit response shape
  exactly — status, headers, and body) when a sensitive path can't resolve a vendor, instead of
  silently proceeding. Fail closed, matching #430's precedent from the same phase (P9.1's fourth
  issue: fail closed on invalid production payment config).
- Both refusal branches call one shared, unexported response constructor, so "no vendor resolved"
  and "rate limit exceeded" are byte-identical to the caller by construction — a caller who could
  tell the two apart could use it to probe which `Host` values resolve to a vendor.

**Decision made and confirmed with the user (2026-08-31):** refuse outright over a fallback bucket
keyed on the IP hash alone. A fallback bucket preserves availability for a legitimate tenant-less
edge case, but that case is not expected to exist in practice (every real customer arrives via a
vendor's real domain), and it would need a schema migration (a nullable `vendorId` or a sentinel
`Vendor` row) for a path only an attacker should ever take.

## #481 — the sensitive-path list never matches the real sign-in/sign-up endpoints

Found live at `/build` (2026-08-31) while writing `isSensitiveAuthPath`'s tests: the original
`sensitivePaths` list matched with `endsWith`, but Better Auth registers the real endpoints at
`/sign-in/email` and `/sign-in/social` (`node_modules/better-auth/dist/api/routes/sign-in.mjs`), not
a bare `/sign-in` — `"/api/auth/sign-in/email".endsWith("/sign-in")` is `false`. Same problem for
`/sign-up` vs the real `/sign-up/email`. `/forget-password` is not a real endpoint in this app's
configuration at all — core Better Auth's route is `/request-password-reset`
(`node_modules/better-auth/dist/api/routes/password.mjs`); `/forget-password` exists only as an
internal OTP-type label inside the `emailOTP` plugin, which `lib/auth.ts` does not configure.
`/reset-password` and `/send-verification-email` are exact matches for their real paths, so those two
are the only entries that ever worked.

**Confirmed live**, not just by reading source: 7 rapid wrong-password `POST /api/auth/sign-in/email`
requests against `npm run preview` all returned `401`, never `429`; same for `/sign-up/email`. The
two highest-value brute-forceable endpoints have been completely unthrottled since #431 shipped to
production on 2026-08-29 — independent of #469's vendor-resolution question, and more severe than
either #468 or #469 on their own. This contradicts `specs/roadmap.md`'s claim that live validation
"correctly blocked a 6th sign-in attempt"; that claim cannot be reconciled with what a live request
to the real endpoint shows today, and is not investigated further here — correcting the roadmap's
historical claim is a documentation concern for `/document`, not something this slice's code needs to
resolve.

**Scope (this slice):** `SENSITIVE_AUTH_PATHS`'s entries are corrected to the real registered suffixes
— `/sign-in/email`, `/sign-up/email`, `/request-password-reset`, `/reset-password`,
`/send-verification-email` — keeping the existing `endsWith` check as-is.

**Not `startsWith`, despite Better Auth's own internal default rate limiter using exactly that**
(`node_modules/better-auth/dist/api/rate-limiter/index.mjs`'s `getDefaultSpecialRules`,
`path.startsWith("/sign-in")`). Checked before assuming it transfers: that internal matcher runs
against `normalizePathname(req.url, basePath)` (`resolveRateLimitConfig`, same file), which **strips**
the auth mount's base path (`/api/auth`) first, leaving a path like `/sign-in/email`. `authOnRequest`
has no such stripping — it reads `new URL(req.url).pathname` directly, which is the full path
(`/api/auth/sign-in/email`). That full path does not start with `/sign-in` at all; only `endsWith`
against the correct suffix works without also replicating Better Auth's basePath-stripping step.

**`/sign-in/social` is deliberately not added.** It's a real registered endpoint
(`node_modules/better-auth/dist/api/routes/sign-in.mjs`), but it starts an OAuth redirect rather than
checking a password — there is no credential to brute-force there, so it doesn't need this throttle.
This app's actual sign-in surface that needs it is `emailAndPassword` (`lib/auth.ts`), matching
`/sign-in/email`.

**Decision made and confirmed with the user (2026-08-31):** fix in this same slice rather than file
and defer, since it is the identical five-entry list already being rewritten for #469's `authDb`
extraction — not a new area of code, and the live-confirmed severity (a completely unthrottled
sign-in/sign-up path) outweighs keeping the PR narrowly scoped to what was originally proposed.

## #482 — `AuthenticationAttempt` has no migration anywhere

Found immediately after fixing #481, while re-confirming the throttle engages live: it still didn't
— `checkAuthRateLimit`'s query threw `The table public.AuthenticationAttempt does not exist`. PR #461
(`e490dbf`) added the model to `prisma/schema.prisma` but **never generated a migration for it** —
confirmed via `git log --all --oneline --diff-filter=A -- "prisma/migrations/*"`, which shows no
commit ever adding one, and via the dev database's own `_prisma_migrations` table, whose most recent
row is `20260829232000_p9_1_data_integrity_hardening` with nothing for the rate-limiting schema
change. `prisma migrate status` reports "up to date" regardless, because there is nothing pending to
apply — the migration simply doesn't exist to be pending.

Since `deploy-staging`/`deploy-production` both run `prisma migrate deploy` against this same
committed directory (`CLAUDE.md`), staging and production almost certainly never got this table
either.

**Scope (this slice):** the missing migration, generated with `prisma migrate diff` (not `migrate
dev` — #378 blocks the normal path on a drifted checksum, the same blocker PR #451 hit for its own
migration) and applied to the dev database. `prisma migrate diff` reported the same three `DROP
INDEX` statements for the `pg_trgm` trigram indexes (`20260820143949_p7_5de_order_search_trigram`)
that PR #451 already documented as false drift from hand-authored DDL Prisma's schema can't express
— excluded here for the identical reason, not re-litigated.

**Decision made and confirmed with the user (2026-08-31):** fold into this slice rather than file and
defer — the four issues are causally linked, and shipping #468/#469/#481 without this would still
leave the feature silently broken.

## #483 — the `onRequest` hook was never actually invoked, for any reason

Found immediately after fixing #482: with the table now present, the throttle *still* didn't engage
live. A temporary diagnostic log inside the hook body never printed for a real request — the hook
was not reached at all, independent of path-matching or the table's existence.

**Root cause:** `getAuth()` passed the hook as a bare top-level config key,
`betterAuth({ onRequest: authOnRequest, ... })`. Better Auth's `router()`
(`node_modules/better-auth/dist/api/index.mjs`) always installs its *own* internal `onRequest` on the
underlying `better-call` router; that internal implementation only loops over
`ctx.options.plugins[].onRequest` — it never reads a bare `ctx.options.onRequest`, so the value
passed in `getAuth()`'s config was accepted by TypeScript (present in `BetterAuthOptions`'s type) and
then silently ignored at runtime. A plugin's `onRequest` also has a different contract:
`(request, ctx) => Promise<{ response: Response } | { request: Request } | void>`
(`@better-auth/core`'s `BetterAuthPlugin` type), not a bare `Response`.

**This is the root cause underlying #469 and #481 mattering in practice at all** — a correct path
list and correct vendor-resolution handling were both still wired to a hook slot Better Auth never
calls. Combined with #482, the auth-rate-limiting feature has never functioned, for three independent
reasons, since #431 shipped.

**Scope (this slice):** `authOnRequest`'s logic is unchanged. It is wrapped in a minimal plugin object
(`authRateLimitPlugin`, `id: "auth-rate-limit"`) whose `onRequest` converts `authOnRequest`'s
`Response | undefined` into the `{ response } | undefined` shape Better Auth's plugin loop expects,
registered via `plugins: [authRateLimitPlugin]` in place of the dead top-level key.

**Re-verified live, end to end, after all three fixes together:** 5 rapid wrong-password
`POST /api/auth/sign-in/email` attempts against the real endpoint return `401`; a 6th and 7th return
`429` with `{"error":"Too many requests"}`; exactly 5 `AuthenticationAttempt` rows are written (the
blocked attempts write none, matching R1's sweep-gating requirement too).

**Decision made and confirmed with the user (2026-08-31):** fold into this slice — same causal chain,
same files already being edited, and the working fix was already verified live before asking.

**Also found and removed in this slice, unrelated to the five issues above:** PR #461 also
accidentally committed `board.json` (616 lines, a stale `gh project item-list` dump) and `scratch.ts`
(a 2-line throwaway exploration snippet) at the repo root. Both deleted here — small, safe,
adjacent-but-unrelated cleanup while already touching this PR's history, confirmed with the user
rather than folded in silently.

**Deliberately excluded:**
- A Cloudflare Cron Trigger for #468's sweep (see above) — not proposed in this slice.
- A fallback rate-limit bucket for #469's tenant-less case (see above) — not proposed in this slice.
- Any change to the order-lookup limiter. It does not share #469's exposure: confirmed by reading
  all three call sites (`app/(storefront)/orders/lookup/page.tsx`,
  `app/(storefront)/orders/lookup/export/route.ts`, `features/orders/guest-data-rights.ts`) — every
  one resolves its vendor with `getCurrentVendorId()`, the *throwing* variant, not
  `getCurrentVendorIdOrNull()`. An unresolved vendor here throws before the limiter is ever reached,
  rather than silently skipping it — the opposite failure mode from #469, and already fail-closed.
  Out of scope because it is a different, already-correct code path, not because it was overlooked.
- Adding a dedicated `createdAt` index for the sweep query (see #468 scope note above).
- Re-litigating where #468/#469/#481/#482/#483 sit on the Project #2 board — already Phase `P8`,
  which is correct given the board's Phase-field ceiling (#267); this slice's PR moves all five to
  `Done` on merge (all filed and started at `In Progress` during this slice's own `/build`).
- Correcting `specs/roadmap.md`'s historical claim about #431's live validation (see #481 above) —
  a `/document`-stage concern, not something this slice's code needs to resolve.
- Investigating exactly where/why the missing table's error (#482, before its migration existed) was
  silently swallowed rather than surfacing as a `500` — filed as **#484** rather than chased down
  here; moot in practice once the table exists.
- The order-lookup limiter is not affected by #483 either: it's called directly from page/route/
  action code as a normal function (`lib/order-lookup-rate-limit-service.ts`), never through Better
  Auth's plugin system at all, so the dead-`onRequest`-key defect has no equivalent there.

**Open items carried forward:** none. All five issues are fully closed by this slice's scope.
