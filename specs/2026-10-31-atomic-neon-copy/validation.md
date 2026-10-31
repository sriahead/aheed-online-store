# Atomic apply for migrate-to-new-neon (validation)

Risk profile: an operator script that writes to a database. Unit tests prove the write order and
error propagation. The live rows (R9, R10) prove the real transaction rolls back on Neon through
the `PrismaNeon` WebSocket adapter. A fake can only reproduce its author's guess about that.

**Before every live row:**
- Run `for v in DIRECT_URL DATABASE_URL; do if printenv "$v" >/dev/null 2>&1; then echo "$v SET"; fi; done`.
  If either prints, prefix every command with `env -u DIRECT_URL -u DATABASE_URL`.
  (The script reads hosts only from its env files, but `migrate deploy` reads the process
  environment.)
- **Precondition P1 (owner):** `secrets/validate-1333.vars` exists with one `DIRECT_URL` line, for a
  new empty database on `Shoplocal Staging` → `scratch`. Without it, R9/R10 are **UNVERIFIED
  (blocked)**.
- **Precondition P2:** migrate the schema into it with
  `env -u DIRECT_URL -u DATABASE_URL DIRECT_URL=<validate url> DATABASE_URL=<validate url> npx prisma migrate deploy`.
  First read the host that `prisma migrate status` reports; it must be the validate host.
- **Precondition P3:** the source `secrets/staging.vars` (old Nocaped staging) is readable. A dry
  run that fails with HTTP 402 or a connection error means R9/R10 are **UNVERIFIED (blocked)**.
- Print hosts only (`sed -E 's#.*@([^:/?]+).*#\1#'`), never whole URLs.

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1  | Unit | Read `scripts/lib/neon-migration-apply.ts`. **Expect:** no `import` line. **Expect:** `export` of `applyPlan`, `class SimulatedFailure extends Error`, and `APPLY_TRANSACTION_OPTIONS` with `maxWait: 30_000` and `timeout: 600_000`. |
| R2  | Unit | Read `applyPlan`. **Expect:** the delete only under `replaceSeeded`; a 500 step in the chunk loop; no call for zero rows; `VendorDomain` only for non-empty `domains`. `rg -n "try|catch" scripts/lib/neon-migration-apply.ts`. **Expect:** no code match (comments are fine). |
| R3  | Unit | Covered by R4(e). Also read `applyPlan`. **Expect:** the `throw new SimulatedFailure` is the last statement, after the `VendorDomain` write. |
| R4  | Unit | `npx vitest run --maxWorkers=4 tests/neon-migration-apply.test.ts`. **Expect:** pass. **Expect:** named tests for each of (a)–(g), each asserting what R4 lists. |
| R5  | Unit | Same file. **Expect:** a source-reading test asserting (a)–(c). Then `git diff origin/staging -- scripts/migrate-to-new-neon.ts`. **Expect:** the `PrismaNeon` import and the two `new PrismaClient({ adapter: new PrismaNeon(...) })` lines are unchanged (d). |
| R6  | Integration (live) | Covered by R10's output. **Expect:** the `committed:` line comes before the per-model count lines of `verifyCounts`. |
| R7  | Integration (live) | Covered by R9's output. **Expect:** the `ROLLED BACK:` line and the exact sentence. **Expect:** no `OK:`/`FAILED:`/count lines after them, and exit code ≠ 0 (`echo "exit $?"`). |
| R8  | Unit | `npx tsx scripts/migrate-to-new-neon.ts --from nope.vars --to nope.vars --target staging --simulate-failure; echo "exit $?"`. **Expect:** `REFUSING:` naming `--simulate-failure`, exit 1, and no `from:`/`to:` line. Repeat with `--apply --verify-only --simulate-failure`. **Expect:** the same. |
| R9  | Integration (live) | `env -u DIRECT_URL -u DATABASE_URL npx tsx scripts/migrate-to-new-neon.ts --from secrets/staging.vars --to secrets/validate-1333.vars --target staging --apply --simulate-failure; echo "exit $?"`. **Expect:** `target vendors: seeded-only`, `ROLLED BACK:` containing the `SimulatedFailure` message, exit ≠ 0. Then the same command without `--apply --simulate-failure` (a dry run). **Expect:** `target vendors: seeded-only` and no `REFUSING:`. Compare the printed `to:` host with the host of each of the three vars files. **Expect:** it equals validate-1333's host and neither Merqify host. |
| R10 | Integration (live) | Straight after R9: `... --apply; echo "exit $?"` (same command without `--simulate-failure`). **Expect:** `committed: <n> ms` with n < 150000, a final `OK: every copied model matches the plan.`, and exit 0. Record n. Afterwards the owner drops `validate_1333`. |
| R11 | Unit | `rg -n "do not re-run" scripts/migrate-to-new-neon.ts`. **Expect:** no match. Read the header. **Expect:** rollback/re-run wording and a `--simulate-failure` usage line. |
| R12 | Unit | `rg -n "Reset it, do not re-run it" docs/developer-portal/env-setup.md`. **Expect:** no match. Read step 3. **Expect:** both statements from R12. `git diff origin/staging -- docs/developer-portal/env-setup.md`. **Expect:** a minor `version` bump and `updated: 2026-10-31` or later. |
| R13 | Unit | `git diff origin/staging -- CHANGELOG.md`. **Expect:** an entry naming `#1333`. |
| R14 | Regression | `npm run lint`, `npm run typecheck`, `npm run format:check`; then, alone, `npx vitest run --maxWorkers=4`. **Expect:** all exit 0. On the PR: `quality / quality` and `quality / kms` green. |
