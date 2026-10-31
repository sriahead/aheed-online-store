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
