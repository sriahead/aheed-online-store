# Auth HTTP-mode transaction crash fix (requirements / acceptance criteria)

Fixes #382: Better Auth's Prisma adapter calls `db.$transaction(...)` on the HTTP-mode Prisma
client `lib/auth.ts` hands it, which throws `Transactions are not supported in HTTP mode` instead
of using the adapter's own non-transactional fallback (which triggers only when
`typeof db.$transaction !== "function"`). See `plan.md` for the full root-cause trace.

R1. `lib/auth.ts` wraps the client passed to `prismaAdapter()` so that `client.$transaction` is
    `undefined` (not a throwing function), while every other property/method on the client behaves
    identically to calling it directly on `getPrisma()`'s return value.

R2. `lib/auth.ts` still calls `getPrisma()` (not `getPrismaWs()`) — this fix must not add a new
    WebSocket connection to the authenticated-request hot path.

R3. `lib/repositories/*.ts` and `lib/*-service.ts` are unmodified by this slice — grep confirms no
    file outside `lib/auth.ts` (and its test) changed.

R4. A new unit test proves the wrapped client's `$transaction` is `undefined` while a representative
    other method (e.g. `$queryRaw` or a model accessor) still resolves and, when invoked, delegates
    to the real underlying client.

R5. Live, against a real deployed environment (not local reasoning): the exact reproduction from
    #382 — upload a bundle photo on `/staff/bundles/<id>` as a signed-in vendor `ADMIN`, which
    fires two `requireVendorRole` calls in the same page visit — completes without a 500, repeated
    enough times (at least 5 consecutive attempts) to be confident the crash is actually gone and
    not just less frequent.

R6. `CHANGELOG.md` updated (Gate 4).

R7. `lint`, `typecheck`, `test`, `format:check` all remain green after this slice.
