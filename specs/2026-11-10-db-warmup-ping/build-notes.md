# Database warm-up ping (build notes)

Branch `feature/1491-db-warmup-ping`, built in the main checkout from `origin/staging` `31c8eb7`.
The spec commit is `c0e73cc0`. Issue #1491.

## What changed and why

- **Schema and migration.** `DbWarmupMode` and `DbWarmupConfig`, a single row with `id = "default"`
  and no `vendorId`, because the config is platform-wide per cell. Migration
  `20261110130000_db_warmup_config` is Prisma's own `migrate diff` output under a `#895` header,
  purely additive. `neon-migration-plan.ts` classifies the model as `skip`.
- **Pure core (`lib/db-warmup/`).**
  - `payload.ts`: the KV schedule format, its parser, and `decideWarmup`. It has no `@/` imports,
    because the scheduler Worker imports it by relative path, like `job-signal-keys.ts`.
  - `schedule.ts`: 8 London days, DST-correct via `parseLocalInput`; it unions the cell's vendors,
    applies overrides, and merges overlaps.
  - `estimate.ts`: the R5 arithmetic.
  - `form.ts`: allow-listing; HH:mm, ranges, CU in 0.25 steps to milli-CU, price to micro-USD.
- **KV (`lib/job-signals.ts`).** That module's header says it is the only one allowed to touch
  `JOB_SIGNALS`, so the four warm-up KV functions live there: `putWarmupSchedule`, `markWarmupPing`,
  `markWarmupActivity` (throttled) and `readWarmupStatus`. The keys live in `lib/job-signal-keys.ts`,
  shared with the scheduler.
- **Activity (R6a).** There is no single session helper; there are 35 call sites of
  `(await getAuth()).api.getSession(...)`. `getAuth()` therefore returns its instance through
  `withWarmupActivity`, which wraps `api.getSession` and calls `recordWarmupActivity()` on a
  signed-in result. The record goes through `ctx.waitUntil`: an un-awaited promise on Workers can be
  dropped when the response ends.
- **Ping (`lib/db-warmup-ping.ts`).** One `healthCheck.findFirst`, then `markWarmupPing`. It is a
  separate module so the ping route imports nothing that reads vendors or the reference DB.
- **Service (`lib/db-warmup-service.ts`).** `computeWarmupPlan` reads hours one vendor at a time
  through the vendor-scoped `fetchVendorProfile`, which keeps `repository-vendor-scoping` intact.
  `publishWarmupSchedule` never throws.
- **Republish (R7).** The three `lib/vendor-service.ts` hours wrappers await the repository write,
  then `publishWarmupSchedule()`.
- **Scheduler.**
  - `selectWarmupJobs`, plus a dedicated branch in `scheduled()` for `*/4`: it reads only its two
    keys, logs `warmup tick ran=… reason=…`, and runs only the ping.
  - `DAILY_CRON` adds `/api/jobs/refresh-warmup-schedule`.
  - The `readSignal` error message no longer says "running its job" unconditionally.
  - `*/4 * * * *` is added to all 5 cron lists.
- **Admin page.** `/staff/platform/db-warmup` (page, `DbWarmupForm`, `actions.ts`), registered in
  `platform-nav-items.ts`, the feature catalogue (platform role), the page-container registry
  (`standard`) and `operator-doc-coverage`'s platform list. The platform admin guide has a section.

## Decisions taken during the build

- **The page guard follows the existing platform pages:** `requireVendorRole("ADMIN")` plus the
  `auth.via !== "platform-admin"` refusal. `tests/operator-doc-coverage.test.ts` derives each page's
  access from exactly that source shape, and would throw on a page without `requireVendorRole`.
- **The save action calls `requirePlatformAdmin()` itself,** and `saveDbWarmupSettings` checks again
  (defence in depth). `tests/rbac-gate-matrix.test.ts` requires the platform-only file to show its
  own gate.
- **The scheduler logs no personal data.** The save log line says `enabled` and `mode` only; the
  actor is stored in `updatedBy`.
- **`computeWarmupPlan` is shared** by the publisher and the page, so the page shows exactly what
  was published.

## Deviations from the spec

- **R6a: the activity throttle is 3 minutes, not 60 seconds.** KV's free tier allows 1,000 writes a
  day per account. At 60 s a continuously busy cell could write 1,440 a day on activity alone; 3 min
  caps it at 480. Against a 30-minute window and a 4-minute tick, accuracy is unchanged.
- **R13: the page uses the established guard shape above, not `requirePlatformAdmin()`.** The
  effective access is the same: platform admins only, `PanelRefusal` for everyone else.
- **R5 validation arithmetic, spec error corrected.** The spec's own formula gives ≈ 88.0 CU-h and
  $9.33 for 7 × 11.5 h windows, not 87.6 / $9.29, which omitted the 5-minute tail. `validation.md`
  is corrected and the test asserts 88.03 / 9.33.

## Known-shaky areas

- **R3 and R16 are not run yet.**
  - R3 (`scripts/verify-db-warmup.ts`) needs `20261110130000_db_warmup_config` applied to **dev**,
    which the owner must do (auto mode blocks `migrate deploy`).
  - R16 needs the merge into `staging`, then one week. Promotion waits for the week's Neon
    comparison.
- **The 12-trigger count is not proven until the first deploy.** 8 are live; the account limit is
  inferred to be higher than 5. If the deploy is refused, use the documented fallback.
- **KV is eventually consistent (about 60 s).** A schedule saved on one edge may reach the
  scheduler's next tick a little late, and the activity marker can lag likewise. Both stay well inside
  the 4-minute tick and the 30-minute window.
- **Wrapping `api.getSession` is a runtime property swap** on the Better Auth instance. Better Auth
  upgrades should re-check that `auth.api.getSession` is still a plain callable; the
  `withWarmupActivity` tests use a fake, not the real instance.
- **`ctx.waitUntil` via `getCloudflareContext()`** falls back to an un-awaited promise outside a
  Worker request (scripts, tests). That is harmless there, but it means the activity write is only
  guaranteed on the Worker.

## Pre-merge verification (2026-11-10, in-session, not independent)

- **R3 passed on dev** (`ep-dry-morning`, migrations applied by the owner with `prisma migrate deploy`):
  `PASS defaults when no row`, `PASS upsert round-trip`, `cleanup: 0 rows left / restored`.
- **What R3 found.** The first run failed. `saveDbWarmupConfig` spread its input straight into
  Prisma, so an object carrying extra fields (the script spread `DB_WARMUP_DEFAULTS`, including
  `updatedAt: null`) reached the database and was rejected. The app's only caller passes exactly the
  right fields, so no shipped path was affected, but the repository now copies the nine writable
  fields explicitly.
