# Rate-limit hardening — validation

Every row names the requirement it proves and the command that proves it. All rows here are
**automated** (a test in the suite) except the live rows and one documentation row.

## Automated rows

| Req | How to verify |
|-----|---------------|
| R1  | `tests/repository-auth-rate-limit.test.ts`: with `Math.random()` mocked below `SWEEP_PROBABILITY`, an allowed call (`count` under the limit) calls `authenticationAttempt.deleteMany` exactly once with a `createdAt: { lt: <Date> }` filter; with `Math.random()` mocked above `SWEEP_PROBABILITY`, `deleteMany` is not called; a call that returns `{ allowed: false }` never calls `deleteMany` regardless of the mocked random value. |
| R2  | `tests/repository-order-lookup-rate-limit.test.ts` (new — no prior coverage existed): the identical three sweep cases as R1 against `orderLookupAttempt.deleteMany`, plus the two pre-existing-behavior cases `tests/repository-auth-rate-limit.test.ts` already has for its sibling ("allows requests when under the limit", "blocks requests when limit is reached"). |
| R3  | Read `lib/repositories/auth-rate-limit.ts` and `lib/repositories/order-lookup-rate-limit.ts`: both declare `RETENTION_MS`/`SWEEP_PROBABILITY` as named constants, and `RETENTION_MS > WINDOW_MS` in each file. |
| R4  | Read `lib/auth.ts`: `isSensitiveAuthPath`, `authOnRequest`, and `authRateLimitPlugin` are all exported top-level. |
| R5  | `tests/auth.test.ts`: with `@/lib/tenant`'s `getCurrentVendorIdOrNull` mocked to resolve `null`, calling `authOnRequest(new Request("https://x/api/auth/sign-in/email"))` resolves to a `Response` with `status === 429`, and `@/lib/repositories/auth-rate-limit`'s `checkAuthRateLimit` mock is never called. |
| R6  | `tests/auth.test.ts`: the `Response` from R5's case and the `Response` from mocking `getCurrentVendorIdOrNull` to resolve a vendor id **and** `checkAuthRateLimit` to resolve `{ allowed: false }` have the same `status`, the same `Content-Type` header, and the same JSON body when both are read with `.text()`. |
| R7  | `tests/auth.test.ts`: with `getCurrentVendorIdOrNull` resolving a vendor id and `checkAuthRateLimit` resolving `{ allowed: true }`, `authOnRequest` resolves to `undefined`, and `checkAuthRateLimit` was called once with that vendor id. |
| R8  | `tests/auth.test.ts`: calling `authOnRequest` with a request whose pathname is `/api/auth/get-session` resolves to `undefined` **without** `getCurrentVendorIdOrNull` or `checkAuthRateLimit` having been called. |
| R9  | Read `lib/auth.ts`'s `SENSITIVE_AUTH_PATHS`: exactly `/sign-in/email`, `/sign-up/email`, `/request-password-reset`, `/reset-password`, `/send-verification-email`, matched with `endsWith`. |
| R10 | `tests/auth.test.ts`: `isSensitiveAuthPath` returns `true` for `/api/auth/sign-in/email`, `/api/auth/sign-up/email`, `/api/auth/request-password-reset`, `/api/auth/reset-password`, `/api/auth/send-verification-email`; `false` for `/api/auth/get-session` and for `/api/auth/sign-in/social`. |
| R14 | `npx prisma migrate status` (dev database) reports "Database schema is up to date!"; a direct query against `authenticationAttempt` (e.g. `prisma.authenticationAttempt.findMany()`) succeeds instead of throwing `TableDoesNotExist`. |
| R15 | `tests/auth.test.ts`: `authRateLimitPlugin.id === "auth-rate-limit"`; calling `authRateLimitPlugin.onRequest(...)` with a mocked `getCurrentVendorIdOrNull` resolving `null` returns an object with a `response` property whose `status` is `429` (not a bare `Response`); calling it with a resolved vendor id and `checkAuthRateLimit` resolving `{ allowed: true }` returns `undefined`. |
| R16 | `git status`/a directory listing shows `board.json` and `scratch.ts` no longer exist at the repo root. |
| R18 | `npm run lint`, `npx tsc --noEmit`, `npx vitest run`, `npm run format:check` — all pass. |

## Live rows — `npm run preview`

| # | Requirement | Procedure | Expected |
|---|---|---|---|
| L1 | R7, R9, R14, R15 (end-to-end, real endpoint) | Against the dev database's single seeded vendor (Aheed), send 6 rapid `POST /api/auth/sign-in/email` requests (the **real** endpoint, not a placeholder path) with a wrong password. If a prior step in this same `/validate` run already sent sign-in attempts from the same origin within the last 60 seconds, wait for the window to clear first. | The first 5 return `401` (real credential check reached each time); the 6th and any further attempt in the same window return `429` with body `{"error":"Too many requests"}`. This is the row that #481/#482/#483 collectively made possible — before all three fixes, this same procedure returned `401` on every attempt, never `429`, regardless of how many were sent. |
| L2 | R1, R14 | After L1, query `authenticationAttempt` for the test IP's rows. | Exactly 5 rows exist (one per allowed attempt) — the blocked 6th/7th wrote none, confirming R1's sweep-gating condition holds on a real write path, not just in the mocked unit test. |

**R5/R6's genuine `vendorId === null` branch is not exercised live in this slice's validation.**
The dev database currently has exactly one active vendor and zero `VendorDomain` rows (see
`specs/2026-08-31-error-boundary-gaps/validation.md`'s L2 note, same environment), so
`getCurrentVendorIdOrNull()`'s single-active-vendor fallback (`lib/tenant.ts`) resolves a vendor for
*any* `Host` value — the `null` branch cannot occur live here without either seeding a second vendor
or temporarily deactivating the only one, both more invasive than this fix warrants. R5/R6 are proven
at the unit level instead (mocking `getCurrentVendorIdOrNull` directly), which is a complete proof of
`authOnRequest`'s own logic; what a live check would add is proof that `getCurrentVendorIdOrNull`
itself can genuinely return `null` in a deployed multi-vendor environment, which is `lib/tenant.ts`'s
existing, already-shipped behavior and not something this slice changes.

## Documentation row

| # | Requirement | Assertion |
|---|---|---|
| D1 | R17 | `CHANGELOG.md` has an entry for this slice, closing #468, #469, #481, #482, and #483, before the branch merges. |
