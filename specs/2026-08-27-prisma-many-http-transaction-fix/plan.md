---
id: prisma-many-http-transaction-fix-plan
title: "updateMany/createMany + direct $transaction HTTP-mode crash fix (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-08-27
visibility: internal
summary: Fix four live 500s caused by writes that need a transaction-capable Prisma client but were wired to getPrisma() (HTTP mode), and add a regression test so this class of bug can't reappear silently.
tags: [prisma, bugfix, database]
related: [auth-http-transaction-fix-plan]
---

# updateMany/createMany + direct $transaction HTTP-mode crash fix (plan)

Supersedes the root-cause half of #382. The prior slice (`specs/2026-08-26-auth-http-transaction-fix/`)
correctly fixed a real defect in Better Auth's adapter wiring, but live re-testing after that fix
shipped (PR #383/#384) still crashed with the identical error. Resuming the investigation (this
session, 2026-08-27) found the actual mechanism: it was never Better Auth. See that folder's
`build-notes.md`, "RESUMED, root cause found and re-scoped" section, for the full trail — this
plan only carries what's needed to fix it.

**Goal:** every write in `lib/repositories/*` that needs a transaction-capable Prisma client
actually gets one, and a new test makes it structurally impossible for a future write to reintroduce
this by accident.

**Root cause, precisely.** Prisma 6's client-side query compiler (`engineType = "client"`,
mandatory per `CLAUDE.md`) unconditionally wraps `updateMany` and `createMany` — and only those two
operations — in an internal transaction, regardless of `where`-clause shape or match count.
`PrismaNeonHttpAdapter` (what `getPrisma()` returns) cannot execute that transaction and throws
`Transactions are not supported in HTTP mode`. Separately, and more simply, any *direct*
`.$transaction()` call on `getPrisma()`'s client throws the same error unconditionally, with no
query-shape nuance at all — that was the original (correct, if narrower) diagnosis, and one live
instance of exactly that pattern was also found this session.

**Confirmed empirically** via a local Node script (`npx tsx`) run directly against the live staging
Neon DB — `PrismaNeonHttp` is a fetch-based adapter, so it reproduces identically outside Workers:

| Operation via `getPrisma()` | Result |
|---|---|
| `updateMany` — any `where` shape, any match count (including 0-row matches) | Crashes, always |
| `createMany` | Crashes |
| `update`, `create`, `upsert` (singular operations) | OK |
| `deleteMany` — both a 0-row and a real 1-row match | OK |

**Scope (this slice) — four call sites, each verified against its actual runtime caller, not its
(frequently misleading) parameter type annotation:**

1. `upsertBundle` (`lib/repositories/bundles.ts:224`) — standalone `updateMany`, called with
   `getPrisma()` from `lib/bundles-service.ts:73`. This is the "Save bundle" form's main save path
   (name/tagline/slug).
2. `setBundleImage` (`lib/repositories/bundles.ts:342`) — standalone `updateMany`, called with
   `getPrisma()` from `lib/bundles-service.ts:100`. Live-confirmed crashing this session (bundle
   image upload).
3. `deactivateCode` (`lib/repositories/discounts.ts:324`) — standalone `updateMany`, called with
   `getPrisma()` at `discounts.ts:351` itself (a repository-internal service wrapper). Staff
   deactivating a discount code.
4. `updateVendorStorefrontConfig` (`lib/repositories/vendor.ts:161`) — calls `getPrisma().$transaction(...)`
   directly, no `updateMany`/`createMany` involved — the simpler, unconditional form of the bug.
   Reachable via `/staff/storefront`'s save action (`features/admin/storefront.ts`).

Fix for each: pass/call `getPrismaWs()` instead of `getPrisma()` at that call site. No application
logic changes — these operations don't need an app-level `$transaction()` wrapper of their own;
Prisma's compiler already opens one internally, and the WS adapter can execute it.

**Guardrail (the reason this is a fix-plus-test slice, not just a fix):** a new Vitest test,
`tests/repository-transaction-safety.test.ts`, matching the existing
`tests/repository-purity.test.ts` pattern (whole-file AST check, no allowlist), enforcing two rules
across every file in `lib/repositories/`:
- **R-A:** no `updateMany(`/`createMany(` call may exist outside a `.$transaction(...)` callback —
  matching the one property every currently-safe call site in this codebase already has, and the
  one property every one of the three broken sites above lacked.
- **R-B:** no `.$transaction(` call may be made directly on the return value of `getPrisma()` (i.e.
  no `getPrisma().$transaction(` in any repository file) — the exact shape of call site #4.

**Cleanup, riding this same branch:** revert the `[382-diag*]` diagnostic `console.log`
instrumentation still live in `lib/auth.ts`, `lib/db.ts`, and `features/admin/bundle-image.ts`
(from the earlier diagnostic PRs #385-#388) — none of it belongs in a shipped fix.

**Deliberately excluded:**
- **No change to how `getPrisma()`/`getPrismaWs()` are constructed** (`lib/db.ts` itself is
  correct; the defect is entirely in which one specific call sites use).
- **Not attempting a type-level (compiler-enforced) fix.** `ReturnType<typeof getPrisma>` and
  `ReturnType<typeof getPrismaWs>` are structurally identical TypeScript types (both are
  `PrismaClient`), which is *why* three of these four call sites carried a misleading type
  annotation for months without a compile error — passing either client type-checks against either
  annotation. A nominal/branded distinction between the two client types would close that gap
  permanently, but ripples through every repository function signature in the codebase and is a
  materially bigger change than this slice's four-call-site fix. Flagged as follow-up work, not
  attempted here — the Vitest guardrail is this slice's actual enforcement mechanism, and it's a
  syntactic check (does the right wrapping exist), not a semantic one (is the right client
  underneath it), which is a real gap the follow-up would close.
- **No re-verification of the `authDb()` Proxy or `rateLimit: { enabled: false }` changes from the
  prior slice.** Both are confirmed correct and harmless (the digest-collision investigation ruled
  them out as insufficient, not as wrong) and are left in place.
- **No audit of `app/`, `features/`, or `components/` for the same pattern.** They're
  ESLint-forbidden (`no-restricted-imports`) from importing `@/lib/db` at all, so this class of bug
  can only originate in `lib/*.ts` or `lib/repositories/*.ts` — both fully covered by this slice's
  grep-and-trace pass and the new test's scope.

**Open items carried forward:**
- The type-level (branded-client) fix noted above, as its own future proposal if the team wants
  compiler-enforced rather than test-enforced protection.
- `updateVendorStorefrontConfig` takes `data: any` — a pre-existing type-safety gap, unrelated to
  this bug, not touched here.
