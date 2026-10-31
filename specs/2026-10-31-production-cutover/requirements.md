# Production cut-over to Merqify, with gated scheduler ticks (requirements / acceptance criteria)

Closes `#1341` and `#1325`. Procedure: `docs/developer-portal/env-setup.md`, "Merqify account".
Narrative and accepted risk: `plan.md`.

- **"Production commands"** below are run by the owner, from commands the assistant hands over.
  Their output is recorded in `build-notes.md`.
- **`S`** and **`P`** are the KV namespace ids the owner reports for staging and production.

**A. KV gating (`#1325`)**

R1. `wrangler.toml` contains an active `[[env.staging.kv_namespaces]]` block with
    `binding = "JOB_SIGNALS"` and `id = "S"`, and an active `[[env.production.kv_namespaces]]`
    block with `id = "P"`.
    - `workers/scheduler/wrangler.toml` contains the same two blocks with the same ids.
    - `S` and `P` are 32 lowercase hex characters and differ.
    - Neither file still says `JOB_SIGNALS` is `NOT YET CREATED`.
    - The top-level `local-job-signals` blocks are unchanged.

R2. Both namespaces exist in the **Merqify** account under the names `aheed-jobs-staging` (id `S`)
    and `aheed-jobs-production` (id `P`), as listed by `wrangler kv namespace list` run with the
    Merqify token from `secrets/merqify-staging.vars`.

R3. `env-setup.md`'s "Gated ticks" section states that both namespaces exist, with the date, and
    that their ids live in the two `wrangler.toml` files.

R4. After the R1 change deploys to staging, `aheed-scheduler-staging` logs at least one
    `scheduler tick cron=*/15 * * * * ran=none` line, seen via `wrangler tail` with the Merqify
    token.

**B. Production (`#1341`)**

R5. Before any production write:
    - `DIRECT_URL` and `DATABASE_URL` are checked one at a time and unset for each command;
    - `prisma migrate status` against the `secrets/merqify-production.vars` direct URL names host
      `ep-dry-mouse-zav9668z…`;
    - `prisma migrate deploy` reports that all migrations were applied.

R6. The `#1333` quick sanity checks pass immediately before the copy: 10 tests, and the
    `--simulate-failure` refusal.

R7. The dry run, `migrate-to-new-neon.ts --from secrets/staging.vars --to
    secrets/merqify-production.vars --target production`, prints `target vendors: seeded-only` and
    a plan with two stores and two generated `VendorDomain` rows, and exits 0.

R8. The same command with `--apply --copy-images` prints `committed: <n> ms`, ends with
    `OK: every copied model matches the plan.`, and exits 0.

R9. `npm run configure-env -- production --file secrets/merqify-production.vars` exits 0.

R10. `grant-role` makes the owner's account a platform admin on production, and
    `demo:accounts -- add` against production prints six lines, created or reconciled.

R11. The promotion PR:
    - goes from `staging` into `main`, titled `Promote <summary> to production`;
    - its body has one closing keyword per line;
    - `gh pr view <N> --json closingIssuesReferences` lists `#1341`, `#1325` and the other
      intended issues, and none of `#104`, `#113`, `#1332`, `#1123`, `#1336`;
    - it is merged with `gh pr merge <N> --merge`.

R12. `deploy-production` on the merge commit succeeds. `/api/health` on `aheed.merqify.com` and
    `srimart.merqify.com` each report:
    - `commit` equal to the merge commit;
    - `db.ok: true`;
    - `reference.reachable: true`;
    - a non-empty `reference.sources`.

R13. `/api/auth/sign-in/email` returns HTTP 200 for:
    - the owner's admin account on `aheed.merqify.com`;
    - `demo-srimart-admin@merqify.com` on `srimart.merqify.com`.

R14. `aheed-scheduler-production` logs at least one `ran=none` tick.

R15. The board and follow-ups are reconciled:
    - every issue closed by the promotion is `Done`;
    - follow-up issues exist for `#1319` R25 and `#1324` R25, on the board with a Phase.

R16. A post-ship sanity-check guide exists:
    - in `env-setup.md` under "Production cut-over", with steps, expected results and a
      "Last run" line;
    - the same steps are on `#1341`.

R17. `CHANGELOG.md` has an entry naming `#1341` and `#1325` (Gate 4).

R18. `lint`, `typecheck`, `format:check` and `npx vitest run --maxWorkers=4` (run alone) pass.
    The `kms/site-internal` build passes after the docs edits. `quality / quality`,
    `quality / kms` and `docs-gates` are green on every PR.
