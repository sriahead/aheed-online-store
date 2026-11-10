# Database warm-up ping (validation)

> **Testing strategy (lean 80/20).** The schedule, estimate and job selection are pure and get
> exhaustive unit tests: DST, overrides, multiple vendors, every skip reason. The two job routes get
> guard tests. A dev integration script proves the repository on the real adapter. Staging proves
> the behaviour and the cost over a week.

Ground rules: run `npx vitest run` alone with `--maxWorkers=4`. Check `DIRECT_URL`/`DATABASE_URL`
one at a time and print the host only before any DB script (CLAUDE.md). Use `npm run preview`, not
`dev`, for DB-touching pages.

## Validation Steps

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1  | Unit | `npx prisma validate` exits 0. `grep -nE "enum DbWarmupMode\|model DbWarmupConfig" prisma/schema.prisma` matches both. `grep -nE "Float\|Decimal\|Json" ` over the model block prints nothing. |
| R2  | Integration | The migration header names `#895`. `grep -niE "\bDROP\b"` on it prints nothing. `git show origin/staging:prisma/schema.prisma > "$TEMP/base.prisma" && npx prisma migrate diff --from-schema-datamodel "$TEMP/base.prisma" --to-schema-datamodel prisma/schema.prisma --script` equals its statements. `tests/neon-migration-plan.test.ts` passes. |
| R3  | Unit / Integration | The repository purity, client-injection and transaction-safety tests pass. `scripts/verify-db-warmup.ts` against dev prints `PASS defaults when no row`, `PASS upsert round-trip` and `cleanup: 0 rows left`. |
| R4  | Unit | `tests/db-warmup-schedule.test.ts` covers: disabled → []; one vendor 09:00–20:00 with 30 min lead → 08:30–20:00 London; summer → 07:30Z, winter → 08:30Z; two vendors 09–17 and 16–20 merged into one window; a closed override removes that day for that vendor only; an override with different hours replaces the weekday; ALWAYS → one window over 8 days; CUSTOM with start ≥ end → []; the DST change day (last Sunday of October) has the correct instants. |
| R5  | Unit | `tests/db-warmup-schedule.test.ts` (estimate block): 7 windows of 11.5 h at 250 milli-CU and 106000 µ$ → `cuHoursPerMonth` ≈ 88.0 (±0.1; corrected at Build from 87.6, which omitted the formula's 5-minute tail), `usdPerMonth` ≈ 9.33 (±0.01), always-on 182.5 CU-h and $19.35. Zero windows → 0 and $0.00. |
| R6  | Unit | The publish test (KV double): the written value parses, `v === 1`, `validUntil` is the end of today + 7, and windows equal `computeWarmupWindows`. A throwing KV `put` is logged and does not reject. |
| R6a | Unit | `tests/db-warmup-activity.test.ts` (KV double): a stored value 30 s old means no write; 90 s old or absent means one write of now; a throwing get or put is logged and does not reject. A test asserts the session helper calls `recordWarmupActivity` only when a user is returned. `grep -n "prisma\|getPrisma" lib/db-warmup/activity.ts` prints nothing. |
| R7  | Unit | Each of the four call sites, with the service mocked, asserts `publishWarmupSchedule` was called after success and not after a failed save. |
| R8  | Unit | The route test returns 503 without a token, 401 with a missing or wrong token, and 200 `{ ok: true, windows }`. |
| R9  | Unit / Static | The route test covers 503, 401, and 200 with `ms`, plus one `findFirst` call and a KV `last-ping` write, and **no** write to `db-warmup:last-activity`. `grep -rn "lib/reference" app/api/jobs/warm-db lib/db-warmup*` prints nothing. |
| R10 | Unit | A test parses `workers/scheduler/wrangler.toml`: each of the top level and the 4 envs has exactly the crons `"*/15 * * * *"`, `"0 3 * * *"` and `"*/4 * * * *"`. |
| R11 | Unit | `tests/scheduler.test.ts` new cases. On `WARMUP_CRON`: in-window → `[WARM_DB_PATH]`; outside → `[]`; `enabled:false` → `[]`; read `{ok:false}` → `[]`; `null` value → `[]`; malformed JSON → `[]`; `v:2` → `[]`; `now ≥ validUntil` → `[]`; outside a window with activity 10 min ago and `activityMinutes` 30 → `[WARM_DB_PATH]` (`recent-activity`); activity 31 min ago → `[]`; `activityEnabled:false` with recent activity → `[]`; activity read `{ok:false}` or unparseable → `[]`; `ACTIVITY_ONLY` (no windows) with recent activity → `[WARM_DB_PATH]`; never includes SWEEP and the others. `DAILY_CRON` includes `REFRESH_WARMUP_PATH`. The existing `*/15` cases pass unchanged. |
| R12 | Unit | Scheduler entry test (or the select-jobs reason output): each of the seven reasons is produced by its case, and the log line format matches. |
| R13 | Unit / E2E | `tests/staff-nav-parity.test.ts`, `tests/page-container.test.ts` and `tests/operator-doc-coverage.test.ts` pass. Under preview: as `demo-platform-admin` the page renders the form (including the activity toggle and minutes), 7 day rows, "Never" for last ping and activity, an "expected to go cold at" line, and an estimate; as `demo-admin` it renders `PanelRefusal`. |
| R14 | Unit | Action test: `mode=FOO`, `activityMinutes=1`, `leadMinutes=999`, `customStart=25:00`, CUSTOM with start ≥ end, and compute 0 each return a field error, with no save and no publish. A valid input saves with `updatedBy` and then publishes. `grep -c "^export const" "app/(admin)/staff/platform/db-warmup/actions.ts"` prints 0. |
| R15 | Acceptance | Each sentence in the guide section maps to a control on the page, recorded in `build-notes.md`. |
| R16 | E2E (staging) | After the merge into `staging`: enable on `staging.aheedfoodcentre.co.uk/staff/platform/db-warmup`, then check the four bullets of R16 using `wrangler tail --env afc-staging` on the scheduler (from a host that can reach Cloudflare) or the page's last ping, and a timed `/api/health` request. After 7 days, read the Neon console compute-hours for the AFC staging project and record the comparison. |
| R17 | Acceptance | `grep -n "Cron Trigger budget" docs/developer-portal/env-setup.md` shows the corrected 8 → 12 text. |
| R18 | Acceptance | `git diff origin/staging -- CHANGELOG.md` has a #1491 entry. |
| R19 | Regression | Run each gate in sequence, then `npx vitest run --maxWorkers=4` alone with 0 failures, and `gh pr checks` all pass. |
