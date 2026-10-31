# Atomic apply for migrate-to-new-neon (build notes)

Written at the end of Build, **before** the Clear. Spec commit `8094350`, build commit `1e04696`,
branch `feature/1333-atomic-neon-copy` (from `staging` at `9d59b74`). Issue `#1333`.

## What changed and why

- **`scripts/lib/neon-migration-apply.ts` (new, no imports).**
  - `applyPlan(client, plan, options)` holds the old `--apply` write block unchanged in order and
    chunk size:
    1. the seeded-vendor `deleteMany` when `replaceSeeded`;
    2. `createMany` per model in `plan.order`, 500 rows per call;
    3. the `VendorDomain` `createMany`.
  - Two small differences from the old block: a zero-row model makes no call, and empty `domains`
    make no call. The old code always called `VendorDomain` `createMany`, even with an empty array.
  - With `simulateFailure`, it throws `SimulatedFailure` after the last write.
  - There is no `try`/`catch`. One comment contains the word "catches", which the R2 grep may
    match; it is not code.
  - `APPLY_TRANSACTION_OPTIONS = { maxWait: 30_000, timeout: 600_000 }`.
- **`scripts/migrate-to-new-neon.ts`.**
  - The `if (apply)` block is now one `targetDb.$transaction((tx) => applyPlan((model) =>
    delegate(tx, model), plan, {...}), APPLY_TRANSACTION_OPTIONS)` call, inside a `try`.
  - On success it prints `committed: <n> ms`, then runs `verifyCounts`/`copyImages` as before.
  - On any error it prints `ROLLED BACK: <message>` and the "re-running is safe" sentence, sets
    `process.exitCode = 1` and returns. The outer `finally` still disconnects both clients.
  - `--simulate-failure` is checked first in `main()`, before `--target` and before any env file is
    read. It is refused (`REFUSING:`, exit 1) without `--apply` or together with `--verify-only`.
  - The header comment gains an "ATOMIC (#1333)" paragraph and a usage line, and drops "do not
    re-run".
  - `delegate()`'s first parameter widened from `PrismaClient` to `object`, so it accepts the
    transaction client `tx`.
- **`tests/neon-migration-apply.test.ts` (new, 10 tests).**
  - R4 (a)–(g) use a recording fake.
  - Three source-reading tests cover R5: exactly one `$transaction(` passed
    `APPLY_TRANSACTION_OPTIONS`; one `applyPlan(` on `delegate(tx, model)`; none of the seven
    direct-write calls.
- **`docs/developer-portal/env-setup.md` 1.28.0.** In step 3 of "Merqify account", the "Reset it, do
  not re-run it" bullet becomes two bullets: the rollback, and the image copy not being covered.

## Decisions taken during the build

- **`--simulate-failure` is checked before `--target`.** R8 requires the refusal before any env
  file is read, and checking it first also makes it independent of the other flags.
- **The `SimulatedFailure` message is** `simulated failure after every write (--simulate-failure)`.
  R9 expects `ROLLED BACK:` to contain it.
- **Progress lines moved into `applyPlan`'s `log` callback**, worded so they say the writes are not
  committed yet: "removed the migration-seeded vendor (inside the transaction)." and "rows written
  (not yet committed)." The old "removed … aheed-food-centre." line no longer names the slug.

## Deviations from the spec

- **R8/R9/validation wording amended in the build commit.** The spec said the script prints
  `from:`/`to:` host lines. It actually prints `source (read only): …` and `target (<target>): …`.
  `requirements.md` R8 and R9 and the matching `validation.md` rows now use the real labels, and
  R8 notes the amendment. Behaviour is unchanged.
- No code deviations.

## Known-shaky areas

- **The live rows (R9, R10) have not run.** They need two things:
  - **Owner precondition P1:** a fresh empty database on `Shoplocal Staging` → `scratch`
    (e.g. `validate_1333`), with its direct URL in a git-ignored `secrets/validate-1333.vars`.
    `scratch`'s "Reset from parent" is no longer a clean target, because new staging is filled.
  - **P3:** old Nocaped staging (`secrets/staging.vars`) must still be readable as the source. Old
    production returns HTTP 402, and old staging was not probed in this session.
- **The interactive transaction on the `@prisma/adapter-neon` 7.9.1 / `@prisma/client` 6.19.3
  straddle** has not been exercised from this script. The app's `getPrismaWs()` (`lib/db.ts`) uses
  the same `PrismaNeon` adapter for interactive transactions, so it is expected to work. Only R9
  proves it.
- **`createMany` inside an interactive transaction** is a nested transaction from Prisma's point of
  view. On the WebSocket adapter that should be fine. Watch R10's output for a `P2028` or
  "Transaction already closed" error.
- **Locally green, CI not yet run:** `lint`, `typecheck`, prettier, and the full suite with
  `npx vitest run --maxWorkers=4` run alone (366 files, 5,343 tests).
- **Deferred:** a write guard for the NEW Merqify hosts is `#1359` (P12, needs `/propose`).

## Validation record

**Pass 1, 2026-10-31, NOT independent.** It ran in the same Opus 5.5 context that built the slice:
the owner continued without `/clear` (the standing "validate in place under 60% context" preference).
Commit under test: `d47e20d`.

- **Pre-flight:** `npm run lint`, `npm run format:check`, `npx tsc --noEmit` and `npm run build`
  exit 0. `npx vitest run --maxWorkers=4`, run alone, passes 366 files and 5,343 tests.
- **R1–R5 pass.**
  - R1: no `import` line; `applyPlan`, `SimulatedFailure extends Error`, and
    `APPLY_TRANSACTION_OPTIONS` `{ maxWait: 30_000, timeout: 600_000 }` are exported.
  - R2: the `try`/`catch` word-boundary grep matches nothing.
  - R3: the `throw new SimulatedFailure()` is the last statement, after the `VendorDomain` write.
  - R4 and R5(a)–(c): all 10 named tests pass.
  - R5(d): the diff touches no `PrismaNeon`/`new PrismaClient` line.
- **R6, R7: structure checked; live output is R9/R10's.** The `catch` prints `ROLLED BACK:` and
  the exact sentence, sets exit 1 and `return`s before `verifyCounts`/`copyImages`.
  `committed:` prints after the transaction and before them.
- **R8 passes.** Both invocations print `REFUSING: --simulate-failure needs --apply and cannot be
  combined with --verify-only`, exit 1, and print no `source`/`target` line. With `--apply`, the
  flag is passed as `simulateFailure` (line 466).
- **R11–R13 pass.**
  - R11: zero `do not re-run`; the ATOMIC paragraph and the usage line are present.
  - R12: zero `Reset it, do not re-run it`; both statements are present; version 1.27.0 → 1.28.0.
    `updated` was already 2026-10-31.
  - R13: the CHANGELOG names `#1333`.
- **P3 met:** a read-only `vendor.count()` on old staging (`ep-empty-scene`) returned 3.
- **R9, R10: UNVERIFIED (blocked on owner precondition P1).** `secrets/validate-1333.vars` does
  not exist. The real transaction on Neon through `PrismaNeon` is still unproven.
- **R14: local half passes; CI runs at Ship** (no PR yet).
