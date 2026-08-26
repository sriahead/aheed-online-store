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

<!--
  R8-R10 added after R5's live check FAILED against the first fix (R1-R4 alone). The digest on the
  error page matched before and after, which looked like proof the fix hadn't worked — it wasn't:
  Next.js's `digest` hashes `err.message + err.stack`, and Prisma's client-engine-runtime dispatches
  `$transaction` through a shared, caller-agnostic interpreter, so the visible stack trace is
  identical regardless of which caller reached `.$transaction()`. The real second cause: Better
  Auth's rate limiter defaults to enabled whenever `NODE_ENV=production` (`options.rateLimit?.enabled
  ?? isProduction`) — never a deliberate choice in this app — and its storage wrapper calls the same
  adapter's `incrementOne`, which has the identical `db.$transaction` fallback pattern R1 already
  covers for `consumeOne`. R1-R4's fix was necessary but not sufficient on its own to make R5 pass.
-->

R8. `lib/auth.ts` explicitly disables Better Auth's rate limiter (`rateLimit: { enabled: false }`) —
    grep confirms the line is present and not conditional on environment.

R9. R5 is re-run in full (5+ consecutive live attempts against a real deployed environment) with
    both R1 and R8 in place, and passes — R5 having failed once already with only R1-R4 deployed is
    the reason R8 exists, and R9 is what actually closes #382, not R5 alone.
