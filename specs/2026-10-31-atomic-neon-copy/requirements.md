# Atomic apply for migrate-to-new-neon (requirements / acceptance criteria)

Closes `#1333`. It builds on `#1323`'s `scripts/migrate-to-new-neon.ts`
(`specs/2026-10-29-merqify-platform-move/`). `--apply` writes the whole copy inside one interactive
transaction, so a failure rolls the target back to its freshly migrated state and a re-run is safe.
Read `plan.md` for why validation uses a `--simulate-failure` flag and a fresh database.

Terms:
- **"The write block"** is today's three steps, in this order: (1) `deleteMany` of the
  migration-seeded vendor when the target is `seeded-only`; (2) `createMany` per model in
  `plan.order`, in chunks of 500; (3) `createMany` of `plan.domains` into `VendorDomain`.
- **"Fresh target"** is a database that has had only `prisma migrate deploy`.

R1. `scripts/lib/neon-migration-apply.ts` exists. It has no `import` statement. It exports:
    - `applyPlan`;
    - `SimulatedFailure`, a class extending `Error`;
    - `APPLY_TRANSACTION_OPTIONS`, equal to `{ maxWait: 30_000, timeout: 600_000 }`.

R2. `applyPlan(client, plan, options)` performs the write block exactly, through `client(model)`:
    - It runs step 1 only when `options.replaceSeeded` is true, as
      `deleteMany({ where: { id: options.seededVendorId } })` on `"Vendor"`.
    - For each model in step 2 it calls `createMany` once per 500-row chunk, and not at all for a
      model with zero rows.
    - It runs step 3 only when `plan.domains` is non-empty.

    It contains no `try`/`catch`.

R3. With `options.simulateFailure` true, `applyPlan` makes every write in R2 and then throws a
    `SimulatedFailure`. With it false or absent, it throws nothing of its own.

R4. `tests/neon-migration-apply.test.ts` exists and passes. Using a recording fake `client`, it
    asserts:
    - (a) the call order is the seeded delete first, then the models in `plan.order`, then
      `VendorDomain`;
    - (b) 1,201 rows for one model give three `createMany` calls of 500, 500 and 201 rows;
    - (c) `replaceSeeded: false` gives no `deleteMany`;
    - (d) a zero-row model and empty `domains` give no `createMany` for them;
    - (e) `simulateFailure: true` rejects with a `SimulatedFailure`, and only after the
      `VendorDomain` call is recorded;
    - (f) a fake `createMany` that rejects mid-plan makes `applyPlan` reject with that same error,
      with no later call recorded;
    - (g) `APPLY_TRANSACTION_OPTIONS` equals R1's literal.

R5. In `scripts/migrate-to-new-neon.ts`:
    - (a) `$transaction(` appears exactly once, and its second argument is
      `APPLY_TRANSACTION_OPTIONS`;
    - (b) `applyPlan(` appears exactly once, inside that transaction's callback, which passes a
      client built from the transaction client `tx`, not `targetDb`;
    - (c) none of `.createMany(`, `.deleteMany(`, `.create(`, `.update(`, `.updateMany(`,
      `.upsert(`, `.delete(` appears;
    - (d) the `PrismaNeon` adapter import and the construction of both clients are unchanged.

    R5 is enforced by a test in `tests/neon-migration-apply.test.ts` that reads the script source.

R6. When the transaction succeeds, the script prints a line matching `^committed: \d+ ms$`. It then
    runs `verifyCounts`, and `copyImages` when `--copy-images` is given, as before.

R7. When the transaction rejects for any reason, the script:
    - prints a line starting `ROLLED BACK:` that contains the error's message;
    - prints the sentence `The target is as migrate deploy left it; re-running is safe.`;
    - exits non-zero;
    - runs neither `verifyCounts` nor `copyImages`.

R8. `--simulate-failure` without `--apply`, or together with `--verify-only`, prints a line
    starting `REFUSING:` that names `--simulate-failure`, and exits 1. It does this before any env
    file is read, so it holds with non-existent `--from`/`--to` paths and prints no `from:`/`to:`
    host line. With `--apply`, the flag reaches `applyPlan` as `simulateFailure: true`.

R9. **Live rollback.** On a fresh target (`secrets/validate-1333.vars`, see `plan.md`), with source
    `secrets/staging.vars`, `--apply --simulate-failure` (no `--copy-images`):
    - prints the plan with `target vendors: seeded-only`;
    - prints `ROLLED BACK:` with the `SimulatedFailure` message;
    - exits non-zero.

    A dry run against the same target straight after again prints `target vendors: seeded-only`
    and no `REFUSING:`. The printed `to:` host equals the host in `secrets/validate-1333.vars`, and
    differs from both `DIRECT_URL` hosts in `secrets/merqify-staging.vars` and
    `secrets/merqify-production.vars`.

R10. **Live clean re-run.** Straight after R9, the same command without `--simulate-failure`:
    - prints `committed: <n> ms` with `n < 150000` (a quarter of the timeout);
    - ends with `OK: every copied model matches the plan.`;
    - exits 0.

    `n` is recorded in the build notes.

R11. The header comment of `scripts/migrate-to-new-neon.ts` no longer contains `do not re-run`. It
    states that a failed `--apply` rolls back and can be re-run, and documents
    `--simulate-failure`, with a usage line.

R12. In `docs/developer-portal/env-setup.md`, "Merqify account" step 3 no longer contains
    `Reset it, do not re-run it`. Its replacement states two things:
    - a failed `--apply` rolls back, and the same command can be re-run;
    - a failure in the image copy after `committed:` leaves the rows in place, so a re-run refuses
      as `occupied`.

    The front-matter `version` is bumped (minor) and `updated` is `2026-10-31` or later.

R13. `CHANGELOG.md` has an entry naming `#1333` (Gate 4).

R14. `npm run lint`, `npm run typecheck` and `npm run format:check` exit 0. `npx vitest run
    --maxWorkers=4`, run alone, passes. `quality / quality` and `quality / kms` are green on the PR.
