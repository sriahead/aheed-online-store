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

## SESSION PAUSED HERE — resume notes (2026-08-26, ~16:00)

**R9 failed too.** `rateLimit: { enabled: false }` was deployed (PR #384, merged, live-confirmed
via `/api/health`) and the exact bundle-upload repro was re-run live: **crashed again, identical
digest.** Root cause #2 (rate limiter) was real code but not what's actually causing this — Better
Auth's rate limiter defaults its **storage** to `"memory"` (`options.rateLimit?.storage ||
(options.secondaryStorage ? "secondary-storage" : "memory")`, in
`node_modules/better-auth/dist/context/create-context.mjs`), and this app has no `secondaryStorage`
configured — so the rate limiter, even when enabled, was **never touching the database at all**.
Disabling it was a correct-but-irrelevant change. Don't re-chase this path.

**Three further diagnostic rounds since, each deployed live and each conclusively ruling something
out** (all via temporary `console.log` instrumentation + `wrangler tail --env staging --format
json`, since this bug's whole nature means a single clean attempt proves nothing and Prisma's own
digest can look identical across genuinely different callers — see above):

1. **`authDb()`'s wrapped client — proven NOT the source.** Live logs show
   `typeof wrappedDb.$transaction === "undefined"` on *every* access, including immediately before
   the crash on the same request. This diagnostic is still live in `lib/auth.ts` as of this
   pause (harmless — just extra `console.log` noise — but should be reverted along with everything
   else once the real fix lands).
2. **`getPrisma()`'s own raw client instance — proven NOT the source either.** Patched
   `client.$transaction` on every `getPrisma()`-constructed instance to log before delegating.
   **Never fired** on the crashing request. (This patch was later *replaced*, not left in place —
   see #3.)
3. **`PrismaNeonHttpAdapter.prototype.startTransaction` — confirmed to fire, but stack trace is a
   dead end.** This is the actual throw site (`@prisma/adapter-neon`'s internal class, never
   exported directly — reached by patching `PrismaNeonHttp.prototype.connect` once to grab the
   adapter it constructs). Patching it live-confirmed the call DOES happen — but the captured
   `new Error().stack` bottoms out entirely inside Prisma's own client-engine-runtime query-plan
   interpreter (`interpretNode`/`execute`/`singleLoader`/`Dr.request`/`li.request` — all internal,
   minified `@prisma/client-engine-runtime` frames). **Prisma 6's compiled-query-plan execution
   model does not preserve the original application call site across its internal async dispatch**
   — this is a structural limitation, not a logging gap. No amount of stack-trace logging at the
   throw site will ever attribute this to a specific application caller. This patch is still live
   in `lib/db.ts` as of this pause.

**Current diagnostic in flight, NOT YET TESTED:** `features/admin/bundle-image.ts`'s
`attachBundleImage` now has `console.log("[382-diag-STEP] N: ...")` before/after each of its own
`await`s (`requireVendorRole`, `getStorage().headObject`, `saveBundleImageForVendor`,
`revalidatePath` x3) — since Prisma's internals can't say which caller, find it by narrowing from
the *application* side: whichever `[382-diag-STEP]` number logs last before the 500, with no
matching next-step log, is where the crash actually happens. This is the most promising lead so
far (PR #388, commit `cec6be2`, merged to staging as `fe1ed5d780047893e7d68c697c3cb5cf38644be0`).

**Blocked on a GitHub Actions outage, not our code**, when this session paused:
`deploy-staging` for PR #388's merge failed with "The job was not acquired by Runner of type hosted
even after multiple attempts" — confirmed via `https://www.githubstatus.com/api/v2/status.json`
showing `"indicator":"major"` (partial system outage) at the time. Re-run via
`gh run rerun 32984007267`; still queued when paused. **Resume by checking whether that run (or a
fresh push) has actually deployed** — `curl -s https://staging.aheedfoodcentre.nocaped.com/api/health`
should report `"commit":"fe1ed5d"` (or later) once it has.

**Exact resume steps:**
1. Confirm staging is serving `fe1ed5d` or later (`/api/health`). If not, check
   `gh run list --branch staging --limit 3` and `githubstatus.com` again before assuming it's still
   the same outage.
2. `export CLOUDFLARE_API_TOKEN=$(grep "^CLOUDFLARE_API_TOKEN=" secrets/staging.vars | cut -d'"' -f2)`
   then `CLOUDFLARE_API_TOKEN=$CLOUDFLARE_API_TOKEN npx wrangler tail --env staging --format json`
   in the background (local wrangler's own OAuth session had also independently expired mid-session
   — this env-var form sidesteps that; retry the tail itself if it drops, which it does often and
   silently in this environment — check the log file grew, don't trust "no error" as "connected").
3. Sign in as `demo-admin@example.com` / `Demo-Aheed-2026!` on
   `https://staging.aheedfoodcentre.nocaped.com`, go to
   `/staff/bundles/b7a978f5-3a46-4d43-9e78-0c00332401fb` (or any bundle), upload any image
   (`public/images/brand/logo.png` works) with any alt text, submit.
4. `grep "382-diag-STEP" <tail output file>` — find the last step number logged before the 500.
   That pinpoints which specific `await` in `attachBundleImage` is triggering Prisma's implicit
   transaction.
5. Once found, the likely real fix is narrower than anything tried so far (possibly: Prisma 6's
   query-plan compiler opens an implicit transaction for a specific query *shape* — e.g. Better
   Auth's `consumeOne`/`incrementOne` fallback's two-sequential-calls pattern, or something in
   `saveBundleImageForVendor`'s `updateMany` — regardless of the adapter wrapper, meaning the actual
   fix may need to be `getPrismaWs()` for that ONE specific call site, or restructuring it to avoid
   whatever query shape triggers this, not another client-wrapping trick).
6. **Revert ALL diagnostic commits before shipping the real fix**: the `console.log` instrumentation
   in `lib/auth.ts` (authDb's trap + construction log), `lib/db.ts` (the `connect()` prototype
   patch), and `features/admin/bundle-image.ts` (the STEP logs) — none of it belongs in the shipped
   fix. `rateLimit: { enabled: false }` can stay (harmless, arguably correct hygiene) or be reverted
   — it's not wrong, just not the cause.
7. Update `requirements.md`/`validation.md` with whatever R-numbers the real fix needs, re-run R9's
   5-consecutive-attempt live check against the ACTUAL fix, then ship normally (staging PR → confirm
   deploy → promote to main, both with explicit user confirmation before each merge per this
   session's established pattern).

**Also noted, unrelated, don't lose track of:** a real UX gap found mid-session — no generic
"Categories" link exists anywhere in the header/landing nav (only per-department links, plus the
empty-cart "Start shopping" link go to `/categories/*` or the bare index) — flagged to the user,
not yet actioned. And the user separately floated "bundles can be promotions" as a future idea.
Neither is part of #382; don't conflate them when resuming.

## RESUMED, root cause found and re-scoped (2026-08-27)

**The step-logging diagnostic deploy (`fe1ed5d`) was stuck in `deploy-staging` for 8+ hours behind
a genuine GitHub Actions outage** (confirmed via `githubstatus.com`, `"major"` at the time). `gh run
rerun`/`gh run cancel` on the stuck run both failed with contradictory errors ("already running" vs.
"completed") — itself a symptom of the outage, not a real state conflict. Unblocked via PR #389: a
trivial no-op PR into `staging` (per CLAUDE.md's "never push directly to staging") that retriggered
`deploy-staging` through a fresh push. It succeeded immediately — the outage had genuinely cleared
by then (downgraded to `"minor"` on githubstatus.com) — confirming the earlier queued run really was
an outage casualty, not a symptom of anything in this repo's own config.

**First live repro after redeploy succeeded on attempt 1.** The `[382-diag-STEP]` log showed steps
1–4 firing (`requireVendorRole`, `headObject`), then step 5 (`before saveBundleImageForVendor`) —
**no step 6**. The `PrismaNeonHttpAdapter.startTransaction` prototype patch fired twice immediately
after, then threw. **This is NOT Better Auth's adapter** — every prior diagnostic round correctly
ruled that out (the `authDb()`-wrapped client's `$transaction` really is `undefined` and really is
never called, reconfirmed in this same request). The crash is the app's own repository code:
`setBundleImage` (`lib/repositories/bundles.ts`) does nothing but a single
`prisma.bundle.updateMany({ where: { id, vendorId }, data: {...} })` through `getPrisma()` — no
`$transaction` anywhere in the app code. Issue #382's original root-cause writeup (Better Auth's
adapter internally calling `db.$transaction()`) is **wrong** as the mechanism, even though the
throw site and error message are identical — see the digest-collision lesson above; it applies to
the root-cause investigation too, not just to comparing two live attempts against each other.

**Trigger condition, confirmed empirically via a local Node script (`npx tsx`) against the real
staging Neon DB** — `PrismaNeonHttp` is a fetch-based adapter, so it reproduces identically outside
Workers, which made this much faster than another round of staging deploys:

| Operation (via `getPrisma()`/HTTP adapter) | Result |
|---|---|
| `updateMany` — any `where` shape, any match count (compound where, unique-only where, even a 0-row match) | **Crashes**, always |
| `createMany` | **Crashes** |
| `update` (singular, unique where) | OK |
| `create` (singular) | OK |
| `upsert` (update branch, on a real `@@unique`) | OK |
| `deleteMany` (0-row match AND a real 1-row match) | OK |

So the mechanism is **operation-type-specific, not where-clause-shape-specific**: Prisma 6's
client-side query compiler (`engineType = "client"`, mandatory per CLAUDE.md) unconditionally wraps
`updateMany`/`createMany` in an internal transaction it cannot execute over the HTTP driver.
`deleteMany` does not, despite being an equally "Many" bulk operation — confirmed with both a 0-row
and a real 1-row deleteMany, so this isn't a row-count effect either. No confirmed public Prisma
issue found describing this exactly; treat it as this app's own confirmed empirical finding, not a
cited upstream bug.

**Full scope, grepped across `lib/repositories/*.ts`**: every standalone (not already inside a
`tx.` block backed by `getPrismaWs()`) `updateMany`/`createMany` call is a live crash waiting to
happen. Four found, all confirmed routed through `getPrisma()` at their call sites:

1. `setBundleImage` (`bundles.ts:342`) — live-confirmed crashing (this session's repro).
2. `upsertBundle` (`bundles.ts:224`) — the `updateMany` branch of the SAME "Save bundle" form's
   update path (name/tagline/slug/etc., not just the image). Likely another instance of what's
   been seen live, given it's the same page's primary save action.
3. `deactivateCode` (`discounts.ts:324`) — called via `getPrisma()` from `lib/discounts-service.ts`;
   hit whenever staff deactivates a discount code.
4. `restoreCartFromOrder` (`orders.ts:526`) — typed `ReturnType<typeof getPrisma>` explicitly; hit
   when a failed order placement restores the shopper's cart.

Every other `updateMany`/`createMany` in the repository layer (`cart.ts`, `data-rights.ts`,
`discounts.ts`'s other calls, `loyalty.ts`, `orders.ts`'s other calls) is already inside a `tx.`
block on `getPrismaWs()` and is NOT at risk — confirmed by grepping for `tx\.` prefixes separately.
`deleteMany`/`upsert`/singular `create`/`update` calls anywhere in the repository layer are also NOT
at risk, per the trigger-condition table above, regardless of which client they run through.

**Not yet done — this is where `/propose` picks up:** decide the fix shape for the four at-risk
call sites (most likely: route each through `getPrismaWs()`'s `$transaction`, matching the pattern
CLAUDE.md already documents for other transactional writes — `updateMany`/`createMany` apparently
need an actual transaction-capable connection regardless of whether the app logic itself needs
transactional semantics), and whether the underlying rule ("use `getPrismaWs()` only for operations
requiring `$transaction`") needs updating in CLAUDE.md to also cover "`updateMany`/`createMany`,
even standalone, unconditionally require it" — since that's a stronger and more surprising
constraint than the current wording implies. Still need to revert the diagnostic instrumentation
(see point 6 above) as part of whatever PR ships the real fix.
