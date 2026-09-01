# Database-backed error event log (requirements / acceptance criteria)

Closes #508. Gives operations a queryable root cause for any thrown error via this app's own
database, independent of Cloudflare Workers Logs (#246, still unconfirmed). Builds on `#480`'s
`instrumentation.ts`/`onRequestError` and does not touch `components/errors/ErrorPanel.tsx` or any
of the four error-boundary files — see `plan.md`'s "Deliberately excluded".

R1. `prisma/schema.prisma` defines a new `ErrorEvent` model with no `Vendor` relation (mirroring
    `HealthCheck`'s existing vendor-less precedent): `id` (uuid, `@id @default(uuid())`), `digest`
    (nullable `String`), `message` (`String`), `stack` (nullable `String`), `path` (`String`),
    `method` (`String`), `routerKind` (`String`), `routeType` (`String`), `createdAt` (`DateTime
    @default(now())`), `@@index([createdAt])`. A migration for it exists under
    `prisma/migrations/`.

R2. `lib/repositories/error-events.ts` exports `normalizeCaughtError(error: unknown): { message:
    string; stack: string | null; digest: string | null }`. For an `Error` instance, `message` and
    `stack` are its real `.message`/`.stack`, and `digest` is its `.digest` property when that
    property exists and is a string, else `null`. For any non-`Error` thrown value (a string, a
    number, a plain object, `undefined`), `message` is `String(error)`, `stack` is `null`, and
    `digest` is `null`.

R3. Same file exports `recordErrorEvent(prisma, input)`, taking a Prisma client and `{ message,
    stack, digest, path, method, routerKind, routeType }`, which creates exactly one `ErrorEvent`
    row per call. Before insert: `message` longer than 2000 characters is truncated to 2000
    characters; `stack` longer than 8000 characters is truncated to 8000 characters; `path` has
    everything from its first `?` onward removed, regardless of what the caller passed in.

R4. Same file exports `listRecentErrorEvents(prisma, limit)`, returning at most `limit` `ErrorEvent`
    rows ordered by `createdAt` descending.

R5. `recordErrorEvent` has a `SWEEP_PROBABILITY` chance (matching the constant name and pattern
    already used in `lib/repositories/order-lookup-rate-limit.ts`) of also deleting every
    `ErrorEvent` row with `createdAt` older than 30 days, via `deleteMany`, on the same call.

R6. `lib/db.ts` exports `getPrismaUncached()`, constructing a fresh `PrismaClient` (via
    `PrismaNeonHttp`) on every call. Unlike `getPrisma()` and `getPrismaWs()`, this export's
    definition is not wrapped in a call to `cache()` from `"react"`.

R7. `instrumentation.ts`'s `onRequestError` calls `recordErrorEvent` (using a client obtained from
    `getPrismaUncached()`) exactly once per invocation, passing `normalizeCaughtError(error)`'s
    result plus `path`, `method`, `routerKind` and `routeType` taken from its own `errorRequest`/
    `errorContext` parameters. Its existing `console.error("Unhandled request error:", { path,
    routerKind, routeType, error })` call is unchanged — both calls happen on every invocation, the
    new one is additive.

R8. If the call chain in R7 (obtaining the client or writing the row) throws or rejects,
    `onRequestError` catches it, logs it via a `console.error` call distinct from R7's existing one,
    and does not throw — the function's returned promise resolves normally regardless of whether the
    write succeeded.

R9. `app/(admin)/staff/errors/page.tsx` exists, following the same two-branch refusal pattern as
    `app/(admin)/staff/runbook/page.tsx`: when `requireVendorRole("ADMIN")` fails with status 401,
    it redirects to `/login`; when it fails with any other status, **or succeeds but the result's
    `via` is not exactly `"platform-admin"`**, it renders `<PanelRefusal>` instead of the row list.
    The `via` check means a per-vendor store admin (any vendor) — who satisfies
    `requireVendorRole("ADMIN")` on its own — sees the same `<PanelRefusal>` a non-admin does.

R10. For a session where `requireVendorRole("ADMIN")` succeeds with `via === "platform-admin"`, the
     same page renders the most recent `ErrorEvent` rows (via `listRecentErrorEvents`, `limit` of
     50), showing at least `message`, `path`, `method`, `routerKind`, `routeType` and `createdAt`
     for each row.

R11. `components/errors/ErrorPanel.tsx` and all four error-boundary files (`app/error.tsx`,
     `app/global-error.tsx`, `app/(storefront)/error.tsx`, `app/(admin)/error.tsx`) have no diff
     against `origin/staging` — this slice exposes nothing new to a visitor.

R12. `CHANGELOG.md` updated (Gate 4).

R13. `lint`, `typecheck`, `test`, `format:check` all remain green after this slice.
