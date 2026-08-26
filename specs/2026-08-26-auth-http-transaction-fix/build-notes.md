# Auth HTTP-mode transaction crash fix (build notes)

Built in the main checkout on branch `fix/auth-http-transaction-crash`, cut from `origin/staging`
at `e715343` (immediately after P8.5c+P8.5d promoted to production as PR #381). Found live while
running `/validate` and `/ship` for P8.5d — a bundle image upload on staging crashed intermittently;
`wrangler tail --env staging --format json` captured the real exception, filed as #382.

## What changed and why

**One function added to `lib/auth.ts`: `authDb()`.** Wraps whatever `getPrisma()` returns in a
`Proxy` that reports `$transaction` as `undefined`. Better Auth's own `@better-auth/prisma-adapter`
(`node_modules/better-auth/node_modules/@better-auth/prisma-adapter/dist/index.mjs`, lines 339-359
and ~380-409) already contains a non-transactional fallback for exactly this — two internal
operations check `typeof db.$transaction !== "function"` before deciding whether to wrap
themselves in `db.$transaction(...)`. The HTTP-mode client's `$transaction` genuinely is a
function, just one that throws `Transactions are not supported in HTTP mode` at runtime (per
`@prisma/adapter-neon`'s `PrismaNeonHttp`), so the guard never tripped before this fix.

**Not `getPrismaWs()`.** The obvious alternative — hand Better Auth the WebSocket client instead —
also fixes the crash, but opens a new WebSocket connection on every authenticated request. Every
`requireRole`/`requireVendorRole` call goes through `getAuth()`, so that's the single hottest path
in the app for DB access — exactly the traffic the HTTP/WS split in `lib/db.ts` exists to keep off
WebSockets. The `Proxy` approach fixes the crash without touching that trade-off at all.

**Only one property is hidden.** Every other method/property on the client passes through the
`Proxy`'s `get` trap and is bound to the real underlying client (`value.bind(target)` for
functions), so Prisma's internal `this`-dependent method implementations keep working exactly as
if the code had called `getPrisma()` directly.

## Decisions taken during the build

**Didn't chase the exact Better Auth internal call site.** The reproduction (bundle image upload's
*second* server action, which re-invokes `requireVendorRole`) is consistent with a session-related
consume/rotate path, but pinning precisely which Better Auth internal function triggers it isn't
load-bearing for the fix — the fix corrects the client's shape for any such call, present or a
future one added by a Better Auth upgrade, not just the one currently observed.

**Exported `authDb` for testability**, matching `buildSocialProviders`'s existing precedent in the
same file (a pure, DB-free helper split out specifically so it doesn't need `getPrisma()`'s real
WASM-backed client to unit-test).

## Deviations from the spec

None. R1-R7 built as written.

## Known-shaky areas

**R5's live check is genuinely the only proof this fix works.** The bug's own defining trait is
intermittency — a single successful reproduction attempt after the fix proves nothing, since the
pre-fix code also "worked" most of the time. `/validate` must run the exact repro loop (upload
flow, 5+ consecutive attempts) against a real deployed environment with `wrangler tail` watching,
not trust a single clean run.

**This fix is scoped to `lib/auth.ts` only.** If any *other* third-party adapter in this codebase
is ever handed `getPrisma()` directly and makes its own transaction decision by introspecting the
client (the same pattern that caused #382), it would need the identical treatment — nothing else
in the codebase currently does this (checked: no other `prismaAdapter`-style third-party adapter
construction exists outside `lib/auth.ts`).

## Follow-up (same branch/PR sequence, added after R5 failed on re-test)

**"Didn't chase the exact Better Auth internal call site" above was the wrong call — it WAS
load-bearing.** `authDb()` alone (R1-R4) was deployed and R5's live check was run: the very first
live attempt after deploying it still crashed, with the **identical error digest** as the pre-fix
bug. Read at face value that looked like "the fix didn't work at all" — which was also not quite
right: Next.js's `digest` hashes `err.message + err.stack`, and Prisma's client-engine-runtime
dispatches `$transaction` through a shared interpreter (`worker.js`'s
`interpretNode`/`execute`/`singleLoader` frames), so the captured stack is identical regardless of
*which* caller reached `.$transaction()` — a digest match proves "some call to `.$transaction()` on
this client failed," not "the same call site as before, unfixed."

**Root cause #2, found by reading `@better-auth/core`'s adapter factory and rate-limiter source
directly** (`node_modules/better-auth/dist/api/rate-limiter/index.mjs`,
`node_modules/better-auth/node_modules/@better-auth/core/dist/context/create-context.mjs`): Better
Auth's built-in rate limiter defaults to `enabled: isProduction` — true on every deployed
environment this app has, and never something `lib/auth.ts` opted into deliberately. Its storage
wrapper calls the adapter's `incrementOne` with a `key` + comparison-operator where clause (not a
bare `id` match), which hits the *identical* `db.$transaction` fallback pattern as `authDb()`
already guards for `consumeOne` — same file, same guard shape, different Better Auth internal
caller. `authDb()` itself is still correct and still needed (it covers `consumeOne` and anything
else that reaches the adapter the same way); it was simply insufficient alone, because the crash
had two independent triggers, not one.

**Fix: `rateLimit: { enabled: false }`, not a third adapter patch.** Disabling a feature this app
never deliberately turned on is lower-risk than trying to make `authDb()` cover every present and
future Better Auth internal caller of `incrementOne`/`consumeOne`-shaped operations. If rate
limiting is wanted later, it needs its own `/propose` — this app doesn't currently have `secondaryStorage`
configured (no KV/Redis), so enabling it correctly is a bigger decision than a hotfix should make.

**Transferable lesson, for this file and for future debugging in this codebase: an error digest
match across two live attempts is not proof of an unfixed root cause — Next.js digests hash a
possibly-shallow stack trace, and async dispatch through a shared runtime (Prisma's client-engine,
here) can make genuinely different callers hash identically.** The only thing that actually settles
"is this fixed" for an intermittent bug is repeating the live reproduction enough times to trust a
negative result, which is why R9 exists as its own requirement rather than trusting R5's first
pass.
