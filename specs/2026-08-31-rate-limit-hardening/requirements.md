# Rate-limit hardening — requirements / acceptance criteria

Closes **#468** (`AuthenticationAttempt`/`OrderLookupAttempt` grow unbounded), **#469** (the auth
rate limiter fails open when no vendor resolves), **#481** (the sensitive-path list never matches
the real sign-in/sign-up endpoints), **#482** (`AuthenticationAttempt` has no migration anywhere),
and **#483** (the `onRequest` hook was never actually invoked, for any reason). #481–#483 were all
found live at `/build`, each surfacing while confirming the previous one's fix actually worked —
together they mean the rate limiter added by #431 has never functioned at all, for three independent
reasons, since it shipped. See `plan.md` for the full rationale, including why #469 is a confirmed
exploitable bypass rather than a cosmetic gap, and why the order-lookup limiter (a different call
path entirely, unaffected by any of #469/#481/#483) shares none of these.

## R1 — Auth throttle sweeps its own table opportunistically

`lib/repositories/auth-rate-limit.ts`'s `checkAuthRateLimit` runs
`prisma.authenticationAttempt.deleteMany({ where: { createdAt: { lt: <cutoff> } } })` on a small
random fraction of calls that return `{ allowed: true }`, using the same `prisma` parameter already
passed in (no `getPrismaWs()`). The sweep never runs on a call that returns `{ allowed: false }`.

## R2 — Order-lookup throttle sweeps its own table opportunistically

`lib/repositories/order-lookup-rate-limit.ts`'s `checkOrderLookupRateLimit` runs the identical sweep
against `prisma.orderLookupAttempt`, under the same conditions as R1. `checkOrderLookupRateLimit`
has no existing unit test anywhere in the suite (confirmed: no file under `tests/` references it) —
its new test file covers the pre-existing allow/block behavior (mirroring
`tests/repository-auth-rate-limit.test.ts`'s two cases for its sibling function) as well as the
sweep, not the sweep alone.

## R3 — Named constants, not magic numbers

Both files define `RETENTION_MS` and `SWEEP_PROBABILITY` as named constants. `RETENTION_MS` is
strictly greater than each file's existing `WINDOW_MS` (60 000 ms).

## R4 — The request-handling logic is extracted into standalone, testable exports

`lib/auth.ts`'s current inline `onRequest: async (req: Request) => { ... }` closure is hoisted out of
the `betterAuth({...})` config object into standalone exports, matching this file's existing
`buildSocialProviders`/`authDb` pattern (both already pulled out of `getAuth()`'s inline config for
the same reason — testability without a live Prisma/Workers context):

- `isSensitiveAuthPath(pathname: string): boolean` — `true` for a pathname ending in one of
  `SENSITIVE_AUTH_PATHS` (R9 gives the corrected real list); `false` otherwise.
- `authOnRequest(req: Request): Promise<Response | undefined>` — the full hook body, calling
  `isSensitiveAuthPath` and unaffected in behavior from today except for R5's new branch.
- `authRateLimitPlugin` (R15) — the Better Auth plugin object `getAuth()`'s config actually
  registers `authOnRequest` through.

## R5 — Auth rate limiter fails closed when no vendor resolves

Inside `authOnRequest`, when `isSensitiveAuthPath(url.pathname)` is `true` and
`getCurrentVendorIdOrNull()` resolves to `null`, `authOnRequest` returns an HTTP `429` `Response`
instead of proceeding to check the rate limit (and, therefore, instead of ever reaching Better
Auth's real handler).

## R6 — The two refusal reasons are indistinguishable to the caller

Both `429` responses `authOnRequest` can return — "no vendor resolved" (R5) and "rate limit
exceeded" (the pre-existing `!limit.allowed` branch) — are built by one shared, unexported response
constructor, so their status code, `Content-Type` header, and body (`{"error":"Too many requests"}`)
are identical by construction, not by two call sites happening to agree.

## R7 — The working case is unaffected

For a sensitive path that resolves a vendor and is under the rate limit, `authOnRequest` still calls
`checkAuthRateLimit` with the resolved `vendorId` and still returns `undefined` (letting the request
reach Better Auth's handler) when the result is `{ allowed: true }` — unchanged from today.

## R8 — Non-sensitive paths are unaffected

`authOnRequest` returns `undefined` without calling `getCurrentVendorIdOrNull` or
`checkAuthRateLimit` at all for any path `isSensitiveAuthPath` returns `false` for.

## R9 — The sensitive-path check matches the real endpoints

`SENSITIVE_AUTH_PATHS` (the array `isSensitiveAuthPath` reads) is `/sign-in/email`, `/sign-up/email`,
`/request-password-reset`, `/reset-password`, `/send-verification-email` — the real paths Better Auth
registers for this app's configured `emailAndPassword` flow (see `plan.md` for why `/sign-in/social`
is deliberately excluded). The check stays `endsWith`, not `startsWith`: `authOnRequest` reads the
full, unstripped `url.pathname`, unlike Better Auth's own internal rate limiter, which matches against
a basePath-stripped path (`plan.md` has the full reasoning) — copying `startsWith` here would silently
never match anything.

## R10 — `isSensitiveAuthPath` proves it against the real registered paths, not assumed ones

`tests/auth.test.ts` asserts `isSensitiveAuthPath` returns `true` for the literal pathnames Better
Auth actually registers for each covered endpoint — `/api/auth/sign-in/email`,
`/api/auth/sign-up/email`, `/api/auth/request-password-reset`, `/api/auth/reset-password`,
`/api/auth/send-verification-email` — not for the placeholder pathnames R4's original test draft
used before #481 was found. It also asserts `isSensitiveAuthPath` returns `false` for
`/api/auth/sign-in/social`, proving the OAuth exclusion in `plan.md` is real, not accidental.

## R11 — Live confirmation that the throttle now engages on the real endpoint

Re-running #468/#469's original live check against the real `/api/auth/sign-in/email` endpoint (not
a placeholder path) under `npm run preview` shows the throttle actually engaging: 5 wrong-password
attempts return `401`, a 6th returns `429`.

## R14 — `AuthenticationAttempt` has a real migration, applied

A migration under `prisma/migrations/` creates the `AuthenticationAttempt` table (columns, index, and
foreign key matching `prisma/schema.prisma`'s existing model declaration — no schema-language change,
only the migration that was always missing). `npx prisma migrate status` reports "Database schema is
up to date!" after it's applied to the dev database, and querying `authenticationAttempt` no longer
throws `TableDoesNotExist`.

## R15 — The rate-limit hook is registered the way Better Auth actually invokes it

`getAuth()`'s `betterAuth({...})` config registers `authRateLimitPlugin` via `plugins: [...]`, not a
bare top-level `onRequest` key. `authRateLimitPlugin` has an `id` field and an `onRequest(request)`
method that calls `authOnRequest` and converts its `Response | undefined` return into the
`{ response } | undefined` shape a Better Auth plugin's `onRequest` must return to short-circuit.

## R16 — Stray files removed

`board.json` and `scratch.ts` (both accidentally committed by PR #461, unrelated to any of the five
issues above) no longer exist in the repository.

## R17 — CHANGELOG updated (Gate 4)

`CHANGELOG.md` records this slice on the branch before merge, including all five issues.

## R18 — Gate 3 catch-all

`npm run lint`, `npx tsc --noEmit`, `npx vitest run`, and `npm run format:check` all pass after this
slice, with no regression in the pre-existing suite.

## Non-requirements

- A Cloudflare Cron Trigger for the retention sweep (see `plan.md`).
- A fallback rate-limit bucket keyed on IP alone for #469's tenant-less case (see `plan.md`).
- A dedicated `createdAt` index for the sweep query (see `plan.md`).
- Any change to the order-lookup limiter's own vendor-resolution behavior (see `plan.md` — it
  already fails closed via a throwing `getCurrentVendorId()`, a different code path from #469's, and
  is unaffected by #483 — it's never wired through Better Auth's plugin system at all).
- Correcting `specs/roadmap.md`'s historical claim about #431's live validation (see `plan.md`'s #481
  section) — a `/document`-stage concern.
- Investigating exactly why the pre-migration `TableDoesNotExist` error was silently swallowed rather
  than surfacing as a `500` — filed as **#484**, moot in this slice once the table exists.
- Any schema change beyond the missing R14 migration — the `AuthenticationAttempt` model in
  `prisma/schema.prisma` itself is unchanged; only the migration that was always missing is added.
