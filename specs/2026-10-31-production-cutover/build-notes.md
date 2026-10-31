# Production cut-over to Merqify, with gated scheduler ticks (build notes)

Spec commit `afda0b7`, branch `feature/1341-production-cutover` (from `staging` at `0abbb67`).
Issues `#1341` and `#1325`. Validation runs in this same session (owner preference), so it is not
independent.

## What changed and why

- **KV namespaces created (R2).** With the owner's go-ahead ("you create them", 2026-10-31), the
  assistant ran `wrangler kv namespace create` using the Merqify token from
  `secrets/merqify-staging.vars`. `wrangler whoami` showed account
  `Merqifyhub@gmail.com's Account` (`3ce00b75…`), which had no namespaces before.
  - `aheed-jobs-staging` = `20aab8dee7f342809679d36f1d96fc6c`.
  - `aheed-jobs-production` = `ba3dd6efb50445bc9cf856664fe6c1c5`.
- **Bindings (R1).** The "NOT YET CREATED" comment blocks in `wrangler.toml` and
  `workers/scheduler/wrangler.toml` are replaced by active `[[env.<env>.kv_namespaces]]` blocks,
  with the same id per environment in both files. `wrangler deploy --dry-run` lists
  `env.JOB_SIGNALS (<id>)` for each. The top-level `local-job-signals` blocks are untouched.
- **Docs (R3).** `env-setup.md` 1.31.0, "Gated ticks": both namespaces exist and their ids live in
  the two files. The obsolete "placeholder block" sentence is removed.
- **CHANGELOG (R17).**

## Decisions taken during the build

- **The assistant created the namespaces** instead of the owner, on the owner's explicit
  instruction. Both are in the Merqify account; the staging token had KV write permission.

## Deviations from the spec

- **The spec said the owner creates the namespaces;** the owner delegated it to the assistant (see
  above). Everything else is as specified.

## Known-shaky areas

- **R4 (staging `ran=none`) needs the merged deploy.** Only after it can `wrangler tail` confirm
  that both Workers bind the same namespace.
- **Part B (R5–R16) is the owner-run production procedure,** recorded below as it happens.
- **Staging connections reset intermittently.** About 1 in 6 `curl` requests to
  `aheed-staging.merqify.com` failed with `Recv failure: Connection was reset` around a deploy on
  2026-10-31. Watch for this on the production hosts.

## Validation record

**Pass 1, 2026-10-31, NOT independent (same session, owner preference).** The production commands
were owner-run from host-guarded scratch scripts, which refused unless the file named `ep-dry-mouse`.
Output was pasted back.

- **R1–R3 pass.** Ids are bound in both files, and `wrangler deploy --dry-run` shows
  `env.JOB_SIGNALS (<id>)`. Both namespaces are listed in the Merqify account. "Gated ticks" is
  updated.
- **R4 passes.** Staging logged `scheduler tick cron=*/15 * * * * ran=none skipped=…` at 13:30:51
  UTC. The first `wrangler tail` died with `fetch failed`, on the local network; the retry worked.
- **R5 passes.** `migrate status` named `ep-dry-mouse`, and `migrate deploy` printed "All
  migrations have been successfully applied."
- **R6 passes:** 10 tests, plus the `REFUSING` refusal.
- **R7 passes.** `seeded-only`; Product 248, User 6 (real accounts only), Vendor 2, and the two
  generated domains; exit 0.
- **R8: rows pass, and images passed on resume.**
  - `committed: 779 ms`, and every model matches.
  - The image copy then failed with `ConnectTimeoutError` to an IPv6 Cloudflare address.
  - A resume with `--verify-only --copy-images` and `NODE_OPTIONS=--dns-result-order=ipv4first`
    reported `images: 151 referenced, 151 copied, … 0 missing` and `OK`.
  - The runbook claimed the images had to be finished by hand; it now documents the resume.
- **R9 passes on the second run.** The first run set 24 of 26; `RESEND_API_KEY` and
  `UK_LOCATION_REF_DATABASE_URL` failed on connectivity. The re-run with IPv4 first set 26 of 26.
- **Hand-set secrets, not in the spec:** `JOB_INVOCATION_TOKEN` on `aheed-store-production` and on
  `aheed-scheduler-production` (which this created), and `WORKERS_AI_PLAN` on the app. All
  succeeded. `configure-env` ignores these keys; the runbook now says so.
- **R10: partly passes.** All six demo logins were created on production. **`grant-role` for the
  owner's account is pending:** it needs the owner to sign up on the live host first.
- **R11 passes.**
  - PR #1366 went from `staging` into `main` and merged with `--merge`; `ff1c13b` has 2 parents.
  - **The closing list first included `#104`,** from the body's own words "Does NOT close #104".
    It was reworded before merge, and the final list was exactly the 19 intended issues.
- **R12 passes.** `deploy-production` run 41207588354 succeeded. Both hosts report `ok`,
  `ff1c13b`, `db.ok: true`, reference reachable, 2 sources, and CDN `images.merqify.com`.
- **R13 passes with the demo accounts.** Sign-in returned 200 for `demo-platform-admin` on aheed
  and `demo-srimart-admin` on srimart; the `@example.com` address returned 401. The owner's own
  account is pending (see R10).
- **R14:** see the line below.
- **R15 passes.** All 19 issues are closed and `Done`. Follow-ups: `#1367` (P10, `#1319` R25),
  `#1368` (P10, `#1324` R25), `#1369` (P12, `#1356` R15/R16).
- **R16 passes:** the sanity check is in `env-setup.md` and on `#1341`.
- **R17 passes. R18:** CI was green on PR #1365 and PR #1366; the local docs build passed.
- **Local network:** connection resets and IPv6 timeouts to Cloudflare from this machine,
  `cloudflare.com` included (4 of 10 failed). They are not a site fault.
