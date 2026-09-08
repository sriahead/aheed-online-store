# P9.2 — Prisma-free ErrorEvent fallback capture (validation)

> **Testing Strategy (Lean 80/20 Model)**
> Provide enough testing to give confidence without creating unnecessary or duplicate tests. Avoid testing the same behaviour multiple times at different levels unless doing so provides additional confidence.
>
> **The Main Principle:**
>
> - **Build:** Did we build the component correctly?
> - **Validate:** Does the feature work correctly in the real system?
> - **Release:** Is the complete system safe, reliable, and ready for users?

## Testing Areas

Every feature should have appropriate **Unit** and **Integration** testing, followed by relevant validation testing. Broader testing mainly happens before release. However, testing is risk-based: features involving auth, payments, UI changes, performance-sensitive APIs, databases, or external dependencies require additional relevant testing earlier.

1. **Unit Testing**
   - _When needed:_ Every feature.
   - _Purpose:_ Test isolated business logic, utilities, and components.
2. **Integration Testing**
   - _When needed:_ Every feature. (Includes Contract testing).
   - _Purpose:_ Verify the component works with its immediate dependencies (e.g., database, external services).
3. **System / End-to-End Testing**
   - _When needed:_ For critical user journeys and validation testing.
   - _Purpose:_ Validate that the feature works correctly in the real system.
4. **Regression & Acceptance Testing**
   - _When needed:_ Mainly before release, or when changing core flows. (Includes Smoke and Sanity testing).
   - _Purpose:_ Ensure existing functionality remains unbroken and acceptance criteria are met.
5. **Performance & Resilience Testing**
   - _When needed:_ Mainly before release, or for performance-sensitive APIs. (Includes Load, Stress, and Spike testing).
   - _Purpose:_ Ensure the system meets throughput/latency targets and degrades gracefully.
6. **Security & Accessibility Testing**
   - _When needed:_ Mainly before release, or earlier for features involving auth, payments, or UI changes.
   - _Purpose:_ Ensure the system is safe and accessible to all users.

---

## Before you start

**Read these four notes first — three of them have cost this repo a wrong result before.**

1. **Only R15 and R16 need a database, and they need the _dev_ one.** Before running them, diff
   the `DATABASE_URL` host in `.env` and `.dev.vars` against `secrets/staging.vars` and
   `secrets/production.vars` and confirm it matches **neither**. A "dev-sounding" file is not
   evidence; only the Neon endpoint id is. The script refuses staging and production itself
   (R14), but check first rather than relying on the guard you are also validating.

2. **Never pipe `scripts/verify-error-event-fallback.ts` through `head`, `tail` or anything that
   closes the pipe early.** It creates a real row and deletes it in its own cleanup section; a
   SIGPIPE from a closed reader can kill it between those two steps and strand the row. Redirect
   to a file and read the file.

3. **Every `grep` row below is written to avoid matching a comment or docstring that merely
   discusses the thing being searched for.** Import checks anchor on `^import`, not a bare
   substring, because `lib/error-event-fallback.ts` legitimately explains in prose why it does not
   import `@/lib/db`. If you loosen a pattern, you will get a false failure.

4. **`npx vitest run` must be run alone**, not alongside a build. Under load its forks pool fails
   to start workers and whole files silently never execute. The baseline recorded in `CLAUDE.md`
   is **114 files / 1495 tests** as of the previous slice; this slice adds tests, so the number
   will be higher — check the new total against a clean run and update `CLAUDE.md` if Build has
   not already.

## Validation Steps

| Req | Testing Area | How to verify                                                                                                                                                                                                                                                                                                             |
| --- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Unit         | `npx tsx -e "import('./lib/error-event-fallback.ts').then(m=>console.log(Object.keys(m).sort().join(',')))"` prints exactly `ERROR_EVENT_INSERT_SQL,buildErrorEventInsertParams,recordErrorEventDirect`. If `tsx -e` produces no output at all, write the same two lines to a scratch `.ts` file under `scripts/` and run that instead — `-e` fails silently on this Windows setup once a real import is involved. |
| R2  | Unit         | `grep -nE '^import' lib/error-event-fallback.ts` shows no line containing `@prisma/client`, `@prisma/client/wasm` or `@/lib/db`. Then `grep -nE '^[^*/]*getPrisma[A-Za-z]*\(' lib/error-event-fallback.ts` prints nothing (exit 1). **The `[^*/]*` prefix is load-bearing, not decoration** — the file's own docstring explains why it does not build a Prisma client, and a bare substring pattern matches that sentence and reports a false failure (confirmed at Build). It is also deliberately not an alternation: a `\|` inside a table cell is a **literal** pipe to `grep -E`, so such a command silently searches for the wrong string. |
| R3  | Unit         | `npx vitest run tests/error-event-fallback.test.ts` passes its SQL-shape tests: the statement matches `/INSERT INTO "ErrorEvent"/`, `ERROR_EVENT_INSERT_SQL.match(/\$\d+/g)` equals `['$1'..'$8']` with no duplicates and no `$9`, and the file contains no template-literal substitution inside the SQL constant.          |
| R4  | Unit         | Same test file asserts the column list, in order, is `id,digest,message,stack,path,method,routerKind,routeType`, and that `ERROR_EVENT_INSERT_SQL` does **not** match `/createdAt/`.                                                                                                                                       |
| R5  | Unit         | Same test file: `buildErrorEventInsertParams(input)` has `length === 8`; `params[0]` matches `/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`; two calls with the identical input produce different `params[0]`.                                                                                         |
| R6  | Unit         | `grep -rn -e 'MESSAGE_MAX =' -e 'STACK_MAX =' lib/` returns exactly two lines, both in `lib/repositories/error-events.ts` (two `-e` flags rather than an alternation, for the reason given in R2). Same test file asserts an over-long message and stack are truncated to 2000/8000 and a query string is stripped from `path` by `buildErrorEventInsertParams`, proving it uses the shared function. |
| R7  | Unit         | `grep -nE '^[^*/]*readEnv\(' lib/error-event-fallback.ts` shows a code line calling it with `"DATABASE_URL"`; `grep -nE '^[^*/]*getEnv\(' lib/error-event-fallback.ts` prints nothing (exit 1). Same comment-excluding prefix as R2, and for the same confirmed reason — the docstring names `getEnv()` while explaining why it is not used. |
| R8  | Unit         | Same test file: with the env reader stubbed to return `undefined`, `await recordErrorEventDirect(input, deps)` resolves `false`, does not throw, and the injected executor was called 0 times.                                                                                                                             |
| R9  | Unit         | Same test file, two cases: an executor that throws synchronously, and one returning `Promise.reject(...)`. Both give `await recordErrorEventDirect(...) === false` with no rejection (`await expect(...).resolves.toBe(false)`).                                                                                           |
| R10 | Unit         | Same test file: with a resolving executor, `recordErrorEventDirect` resolves `true` and the executor was called **exactly once**. Also assert no call's SQL text matches `/DELETE/i`, pinning the deliberate absence of a retention sweep.                                                                                  |
| R11 | Unit         | `npx vitest run tests/instrumentation.test.ts` — with the Prisma write mocked to resolve, the mocked `recordErrorEventDirect` was called 0 times.                                                                                                                                                                          |
| R12 | Unit         | Same test file — with the Prisma write mocked to reject, `recordErrorEventDirect` was called exactly once and its first argument deep-equals the object passed to `recordErrorEvent`.                                                                                                                                      |
| R13 | Unit         | Same test file — both mocks rejecting: `await expect(onRequestError(...)).resolves.toBeUndefined()`, and `console.error` calls include `Unhandled request error:`, the Prisma-failure line, and a distinct fallback-failure line (three separate calls).                                                                    |
| R14 | Security     | `grep -n 'checkDestructiveTarget' scripts/verify-error-event-fallback.ts` shows both the import and a call. Refusal itself is proven by `npx vitest run tests/db-target-guard.test.ts` (green), **not** by pointing the script at staging — running it there to watch it refuse would write to staging if the guard were broken. |
| R15 | Integration  | `npx tsx scripts/verify-error-event-fallback.ts > fallback-run.txt 2>&1; echo "exit=$?"` — expect `exit=0`. Then `cat fallback-run.txt`: it prints the dev Neon endpoint it targeted, a row count before, `inserted`, all eight column values read back matching what was supplied, `deleted`, and a row count after equal to the count before. |
| R16 | Integration  | In the same `fallback-run.txt`: `grep -c 'ERR_UNKNOWN_FILE_EXTENSION' fallback-run.txt` prints `0` and `grep -c '\.wasm' fallback-run.txt` prints `0` — the fallback ran in plain Node with no WASM loader involved, which is the design property the whole slice rests on.                                                  |
| R17 | Regression   | `grep -n 'error-event-fallback' CLAUDE.md` returns at least one line that also contains `raw SQL`, and the surrounding bullet states the scope (one parameterised INSERT, one table, error path only).                                                                                                                     |
| R18 | Regression   | `grep -n 'error-event-fallback' specs/architecture.md` returns lines near **both** no-raw-SQL statements (the section 3.1 modelling rule and the later modelling-rules bullet). `git diff origin/staging -- specs/architecture.md` shows the front-matter `version` increased.                                              |
| R19 | Regression   | `npm run kms:validate` exits 0. `npm run kms:check-generated` exits 0. If either fails on this slice's new `plan.md`, run `npm run kms:build-index` and commit **both** generated files.                                                                                                                                   |
| R20 | Acceptance   | `git diff origin/staging -- CHANGELOG.md` is non-empty and describes this slice under `[Unreleased]`.                                                                                                                                                                                                                     |
| R21 | Regression   | `npm run lint`, `npm run typecheck`, `npm run format:check` each exit 0, and `npx vitest run` (run alone — see note 4) exits 0 with **no** `Failed to start forks worker` line and a file/test total at or above the recorded baseline.                                                                                     |

## What this validation deliberately does not do

**It does not reproduce the WASM panic.** Nothing available here can force
`new QueryCompiler(...)` to fail on demand, and a fabricated stand-in would prove only that a
stand-in works. The claim is decomposed instead: R9/R12 prove the wiring fires whenever the Prisma
write throws _for any reason_ (which the real panic is an instance of), and R15/R16 prove the
fallback genuinely writes to real Postgres from a runtime with no WASM query compiler in it. If a
row cannot be produced for R15, the honest outcome is **not verified** — do not substitute a mock
and mark it passed.
