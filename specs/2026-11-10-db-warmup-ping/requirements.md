# Database warm-up ping (requirements / acceptance criteria)

Closes #1491. A scheduler ping keeps each cell's Neon database awake during store opening hours.
It is off by default and configured by platform admins, with a compute-hour and cost estimate. The
narrative and rationale are in `plan.md`. All times are Europe/London (`STORE_TIMEZONE`) unless
stated, and every window is a pair of UTC instants.

## Configuration

R1. `prisma/schema.prisma` adds
    `enum DbWarmupMode { OPENING_HOURS ALWAYS CUSTOM ACTIVITY_ONLY }` and `model DbWarmupConfig`, with
    these fields:

    | Field | Type and default |
    |---|---|
    | `id` | `String @id @default("default")` (one row per database) |
    | `enabled` | `Boolean @default(false)` |
    | `mode` | `DbWarmupMode @default(OPENING_HOURS)` |
    | `activityEnabled` | `Boolean @default(true)`: also keep warm after signed-in activity (R6a) |
    | `activityMinutes` | `Int @default(30)`: how long after the last signed-in request |
    | `leadMinutes` | `Int @default(30)` |
    | `customStart` | `String?` (HH:mm) |
    | `customEnd` | `String?` (HH:mm) |
    | `computeMilliUnits` | `Int @default(250)` |
    | `priceMicroUsdPerCuHour` | `Int @default(106000)` |
    | `updatedBy` | `String?` |
    | `updatedAt` | `DateTime @updatedAt` |

    It has no `Json`, `Float` or `Decimal` column.
R2. The migration `2026111013xxxx_db_warmup_config` is hand-authored per `#895` with the standard
    header. It is purely additive (one enum, one table, no `DROP`), and its statements equal
    `prisma migrate diff` from `origin/staging`'s schema. `scripts/lib/neon-migration-plan.ts`
    classifies `DbWarmupConfig` as `skip` (per-environment setting).
R3. `lib/repositories/db-warmup.ts` exports `getDbWarmupConfig(prisma)` and
    `saveDbWarmupConfig(prisma, input, actorEmail)`:
    - `get` returns the stored row, or the defaults when there is none;
    - `save` is an `upsert` on `id = "default"`.

    It passes the repository purity, client-injection and transaction-safety tests. It does not
    take a `vendorId`, because the config is platform-wide.

## Schedule (pure)

R4. `lib/db-warmup/schedule.ts` exports `computeWarmupWindows(input)`. The input is the config, a
    `now` instant, every vendor's weekly hours, and every override from today onward. It returns
    sorted, non-overlapping `{ start, end }` windows covering London calendar days today through
    today + 7, by mode:
    - **`enabled = false`:** no windows.
    - **`OPENING_HOURS`:** for each London day, every vendor's open interval for that weekday,
      where an override on that exact date replaces it and an override `closed = true` gives no
      interval for that vendor that day. Each interval starts `leadMinutes` earlier. Overlapping or
      touching intervals across vendors are merged. Days with no open vendor have no window.
    - **`ALWAYS`:** a single window from the start of today to the end of today + 7.
    - **`CUSTOM`:** `customStart`–`customEnd` on every day, or no windows if either is unset or
      start ≥ end.
    - **`ACTIVITY_ONLY`:** no scheduled windows. Only signed-in activity keeps it warm (R6a).

    Local times convert to instants DST-correctly through `lib/local-datetime.ts`. 09:00 London is
    08:00 UTC in summer and 09:00 UTC in winter.
R5. `lib/db-warmup/estimate.ts` exports `estimateWarmupCost(windows, config)`, returning
    `{ windowHoursPerWeek, cuHoursPerMonth, usdPerMonth, alwaysOnCuHoursPerMonth,
    alwaysOnUsdPerMonth }`:
    - `windowHoursPerWeek` is the total window duration over the first 7 days;
    - `cuHoursPerMonth = (windowHoursPerWeek + windowsInWeek × 5/60) × 30.4/7 × computeMilliUnits/1000`,
      where the 5/60 is Neon's 5-minute suspend tail after each window;
    - `usdPerMonth = cuHoursPerMonth × priceMicroUsdPerCuHour / 1e6`;
    - always-on uses 730 hours.

    The page shows both CU-hour figures to one decimal and both costs to 2 decimals. Activity-based
    warmth cannot be predicted, so the page says the estimate covers scheduled windows only, and that
    each signed-in session outside them adds its own length plus `activityMinutes`.

## Publishing the schedule (no database read by the scheduler)

R6. `lib/db-warmup-service.ts` `publishWarmupSchedule()` reads the config, weekly hours and
    overrides, computes the windows, and writes KV key `db-warmup:schedule` (constant in
    `lib/job-signal-keys.ts`) in the `JOB_SIGNALS` namespace. The value is
    `{"v":1,"enabled":bool,"activityEnabled":bool,"activityMinutes":n,"windows":[[startIso,endIso],…],"validUntil":iso,"generatedAt":iso}`,
    where `validUntil` = end of today + 7 days. A KV failure is logged and never throws to the
    caller.
R6a. **Signed-in activity is recorded in KV, never in the database.** `lib/db-warmup/activity.ts`
     `recordWarmupActivity(now)` writes KV `db-warmup:last-activity` = now ISO. It is called from the
     single helper every server-side session read goes through, whenever that read returns a signed-in
     user (shopper or staff). To bound KV writes, it first reads the key and writes only when the
     stored instant is absent or more than 60 s old, so there is at most one write per minute per cell.
     A KV failure is logged and never affects the request. It adds no database query.
R7. `publishWarmupSchedule()` is called after every successful call to these (the `lib/vendor-service.ts`
    wrappers for the last three):
    - save on `/staff/platform/db-warmup`;
    - `replaceVendorFooterHours`;
    - `saveVendorHoursOverride`;
    - `deleteVendorHoursOverride`.
R8. A new token-guarded `POST /api/jobs/refresh-warmup-schedule` calls `publishWarmupSchedule()`
    and returns `{ ok: true, windows: n }`. Its guard is identical to the existing job routes: 503
    when `JOB_INVOCATION_TOKEN` is unset, 401 for a missing or wrong `x-job-token`.

## Ping

R9. A new token-guarded `POST /api/jobs/warm-db` (same guard as R8) runs exactly one Prisma query
    on the main database (`healthCheck.findFirst({ select: { id: true } })`) and writes KV
    `db-warmup:last-ping` = now ISO. It does **not** write `db-warmup:last-activity`, because a ping
    is not activity; otherwise the ping would keep itself alive forever. It returns `{ ok: true, ms }`. No file it imports reaches
    `lib/reference/`.
R10. `workers/scheduler/wrangler.toml` adds the cron `"*/4 * * * *"` to the top level and to each of
     the `staging`, `production`, `afc-staging` and `afc-production` environments. The two existing
     crons stay unchanged.
R11. `workers/scheduler/src/select-jobs.ts`:
     - exports `WARMUP_CRON = "*/4 * * * *"`, `WARM_DB_PATH = "/api/jobs/warm-db"` and
       `REFRESH_WARMUP_PATH = "/api/jobs/refresh-warmup-schedule"`;
     - **on `WARMUP_CRON` it returns `[WARM_DB_PATH]` only if** the `db-warmup:schedule` read
       succeeded, parses as `v:1`, has `enabled: true`, `now` < `validUntil`, **and either** `now`
       falls inside a window, **or** `activityEnabled` is true and a successful read of
       `db-warmup:last-activity` is within `activityMinutes` of `now`. Otherwise it returns `[]`. A
       failed or unparseable activity read counts as "no recent activity" (skip). It never returns any
       other job on that cron.
     - `DAILY_CRON` additionally returns `REFRESH_WARMUP_PATH`.
     - The `*/15` behaviour is unchanged.

     The scheduler's own code comments state that this cron fails toward skipping.
R12. The scheduler logs one line per warm-up tick, `warmup tick ran=<path|none> reason=<…>`, with
     the reason one of: `in-window`, `recent-activity`, `outside-window`, `disabled`, `no-schedule`,
     `stale`, `unreadable`.

## Platform admin page

R13. `app/(admin)/staff/platform/db-warmup/page.tsx`:
     - guards with `requirePlatformAdmin()`; it redirects 401 to `/login` and renders
       `PanelRefusal` on 403;
     - uses `<PageContainer width="standard">`;
     - is registered once in `components/staff/platform-nav-items.ts`, and the nav-parity and
       page-container tests pass.

     It shows:
     - the form: enabled toggle, mode, "Also keep warm after signed-in activity" toggle with minutes
       (5–240), lead minutes (0–120), custom start and end (HH:mm), compute size in CU (0.25–16, step
       0.25), and price per CU-hour (USD);
     - the windows for the next 7 days in London time (weekday, date, from–to), or "None" per day;
     - the last ping time and the last signed-in activity from KV, or "Never";
     - **"Database expected to go cold at"** = the later of the last ping and the last activity + 5
       minutes, labelled approximate. Neon suspends after 5 minutes with no active query, and requests
       from signed-out shoppers are not recorded.
     - the R5 estimate, labelled as an estimate, with the always-on comparison;
     - in `OPENING_HOURS` mode with no vendor weekly hours set, the notice "No opening hours are set for any
       store in this cell, so no pings will run", linking to where hours are edited.
R14. The save action is a `"use server"` file exporting only async functions. It allow-lists every
     input:
     - mode is one of the four values;
     - activity minutes are within 5–240;
     - integers are within range;
     - HH:mm values are valid;
     - in `CUSTOM` mode, start < end;
     - otherwise it returns a field error without writing.

     On success it saves with `updatedBy` = the actor's email, calls `publishWarmupSchedule()`, and
     revalidates the page.
R15. The platform admin guide documents the page: what it does, the defaults, what the estimate
     assumes, that it is per cell, and how to switch it off. Every sentence traces to a control.

## Rollout and evidence

R16. Staging validation, after the merge into `staging`:
     - Enabled on Aheed staging in `OPENING_HOURS` mode, `db-warmup:last-ping` advances at about
       4-minute intervals inside a window, and the scheduler logs `ran=/api/jobs/warm-db
       reason=in-window`.
     - Outside a window it logs `reason=outside-window` and the ping stops.
     - Outside a window, signing in and loading a staff page makes the next tick log
       `reason=recent-activity`. Pings continue for about `activityMinutes`, then stop.
     - A first request to `staging.aheedfoodcentre.co.uk/api/health` inside a window, ≥ 10 minutes
       after the previous request, completes in **< 1.5 s**, against 7.1 s cold (2026-11-10).
     - Switched off, the next tick logs `disabled`.
     - After one week enabled, the Neon console's compute-hours for Aheed staging is within ±30 % of
       the page's estimate, recorded in `build-notes.md`. Promotion to `main` waits for this.
R17. `docs/developer-portal/env-setup.md` corrects the Cron Trigger budget line. It states 8 live
     before this slice and 12 after, and that the account limit is above the Free plan's 5.
R18. `CHANGELOG.md` updated (Gate 4).
R19. `npm run lint`, `typecheck`, `format:check`, `kms:validate`, `kms:check-generated` and
     `npx vitest run --maxWorkers=4` pass, and PR CI is green (Gate 3).
