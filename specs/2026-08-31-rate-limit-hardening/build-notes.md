# Rate-limit hardening — build notes

Written at the end of Build, before the Clear.

Closes **#468**, **#469**, **#481**, **#482**, **#483**.

## What changed and why

| File | Change |
|---|---|
| `lib/repositories/auth-rate-limit.ts` | `checkAuthRateLimit` gains an opportunistic retention sweep (`RETENTION_MS`, `SWEEP_PROBABILITY` constants), gated to allowed calls only (#468). |
| `lib/repositories/order-lookup-rate-limit.ts` | Identical sweep added to `checkOrderLookupRateLimit` (#468). |
| `lib/auth.ts` | `onRequest`'s inline closure hoisted into `isSensitiveAuthPath` (corrected path list, #481), `authOnRequest` (fail-closed on no vendor, #469), and `authRateLimitPlugin` (registered via `plugins: [...]` instead of the dead `onRequest` top-level key, #483). |
| `prisma/migrations/20260831025536_p9_1_auth_rate_limit_missing_table/` | **New.** The migration `AuthenticationAttempt` never had (#482). No `schema.prisma` change — the model was already correct. |
| `tests/repository-auth-rate-limit.test.ts` | Extended with sweep coverage (3 new cases) plus a `Math.random` default so pre-existing tests stay deterministic. |
| `tests/repository-order-lookup-rate-limit.test.ts` | **New.** No coverage existed for this function at all before this slice; mirrors the auth sibling's full test shape (allow/block + sweep). |
| `tests/auth.test.ts` | New `isSensitiveAuthPath`, `authOnRequest`, `authRateLimitPlugin` suites (13 cases). |
| `board.json`, `scratch.ts` | **Deleted.** Accidental artifacts from PR #461, unrelated to any of the five issues. |

## Decisions taken during the build

This slice started as #468+#469 only, approved at `/spec`. Three more defects were found live,
each discovered while confirming the fix for the one before it actually worked — none was
speculative, all were confirmed with a real request against `npm run preview` before being
reported or fixed. Each was folded in by explicit `AskUserQuestion` approval before any code was
written for it (see `plan.md`'s per-issue "Decision made and confirmed with the user" notes):

- **#481 — the sensitive-path list never matched Better Auth's real endpoints.** Found while
  writing `isSensitiveAuthPath`'s tests: `/api/auth/sign-in/email` doesn't end with `/sign-in`
  (Better Auth's own routes never register a bare `/sign-in`), and `/forget-password` isn't a real
  endpoint in this app at all. Confirmed live before fixing: 7 wrong-password attempts against the
  real endpoint all returned `401`, never `429`. **Not fixed with Better Auth's own `startsWith`
  convention**, despite that being tempting to copy from `getDefaultSpecialRules` — that internal
  matcher runs against a basePath-stripped path; `authOnRequest` reads the full, unstripped
  pathname, so `startsWith` there would silently never match anything. `endsWith` with the
  corrected literal suffixes is what actually works. `/sign-in/social` deliberately excluded — an
  OAuth redirect has no password to brute-force.

- **#482 — `AuthenticationAttempt` had no migration, anywhere.** Found immediately after fixing
  #481, re-testing live: still no `429`, now because `checkAuthRateLimit`'s query threw
  `TableDoesNotExist`. `git log --diff-filter=A -- "prisma/migrations/*"` confirmed no migration
  was ever committed for this model, despite `prisma/schema.prisma` carrying it since PR #461.
  Generated the missing migration with `prisma migrate diff` (`migrate dev` is blocked by #378's
  drifted checksum, the same workaround PR #451 used) and applied it. The diff also reported the
  same three `pg_trgm` `DROP INDEX` statements PR #451 already documented as false drift from
  hand-authored DDL — excluded here for the identical, already-recorded reason.

- **#483 — the `onRequest` hook was never actually invoked, for any reason.** Found immediately
  after fixing #482: with the table now present, the throttle *still* didn't engage. A temporary
  diagnostic `console.error` inside the hook never printed for a real request. Root cause: a bare
  top-level `onRequest` key in `betterAuth({...})`'s config is accepted by TypeScript (the option
  exists on the type) but never read at runtime — `router()` (`better-auth/dist/api/index.mjs`)
  always installs its own internal `onRequest`, which only loops over
  `ctx.options.plugins[].onRequest`. Fixed by wrapping the unchanged `authOnRequest` logic in a
  minimal plugin object (`id: "auth-rate-limit"`) registered via `plugins: [...]`, converting its
  `Response | undefined` return into the `{ response } | undefined` shape a plugin's `onRequest`
  contract requires. This is the root cause that made #469's and #481's fixes moot on their own —
  a correct path list and correct vendor-resolution handling were both wired to a hook slot Better
  Auth never calls.

- **Stray files.** `board.json` (616 lines, a stale `gh project item-list` dump) and `scratch.ts`
  (a 2-line Better Auth exploration snippet) — both committed by PR #461, unrelated to any of the
  five issues. Deleted with explicit user confirmation rather than left or silently removed.

## Deviations from the spec

None beyond what `requirements.md`/`plan.md` already document as the outcome of each
`AskUserQuestion` above — every expansion is recorded as its own numbered requirement (R9-R10 for
#481, R14 for #482, R15 for #483, R16 for the stray files), not left as an undocumented gap.

## Known-shaky areas

- **The pre-migration `TableDoesNotExist` error was silently swallowed somewhere in Better Auth's
  or the router's request handling**, rather than surfacing as a `500`. Not chased down — moot in
  practice once the table exists (R14). Filed as **#484** rather than investigated further in this
  slice. If a future slice touches `onRequest`/plugin error handling, read that issue first.
- **R5/R6 (fail-closed on no vendor) are proven only at the unit level**, not live. The dev
  database has exactly one active vendor and zero `VendorDomain` rows, so
  `getCurrentVendorIdOrNull()`'s single-vendor fallback resolves a vendor for any `Host` — the
  `null` branch cannot be reproduced live here without reseeding a second vendor or deactivating
  the only one, both judged more invasive than this fix warrants. Recorded in `validation.md`
  rather than glossed over.
- **This slice grew from 2 issues to 5 mid-build.** `/validate` should re-read `plan.md` in full,
  not just skim for #468/#469 — the bulk of what actually matters here (#481-#483) was found after
  the original spec was written.
