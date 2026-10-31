# Production cut-over to Merqify, with gated scheduler ticks (validation)

Risk profile: production infrastructure and a promotion. Unit tests barely apply; the live rows
are the validation.

- Every production command is run by the owner, and its output is pasted or recorded.
- Print hosts only, never full URLs or secrets.
- Run `npx wrangler whoami` before any manual wrangler command: this machine's default login is
  Cobrasmash, not this project.

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1  | Unit | `git diff origin/staging -- wrangler.toml workers/scheduler/wrangler.toml`. **Expect:** four active blocks with matching ids per environment, ids matching `^[0-9a-f]{32}$` and differing, and no `NOT YET CREATED` for `JOB_SIGNALS`. `rg -n "local-job-signals"` in both files is unchanged. |
| R2  | Integration (live) | With `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID` from `secrets/merqify-staging.vars`: `npx wrangler kv namespace list`. **Expect:** both names with ids `S` and `P`. |
| R3  | Unit | Read `env-setup.md` "Gated ticks". **Expect:** the created statement, the date, and where the ids live. |
| R4  | Integration (live) | After the staging deploy, with the same token: `npx wrangler tail aheed-scheduler-staging --format pretty` across a quarter-hour boundary. **Expect:** `ran=none` on an idle tick. Record the line. |
| R5  | Integration (owner) | The owner pastes `migrate status` (the host line) and `migrate deploy` ("All migrations have been successfully applied"). **Expect:** host `ep-dry-mouse`. |
| R6  | Unit | `npx vitest run tests/neon-migration-apply.test.ts` gives `10 passed`; the refusal command gives `REFUSING`, exit 1. |
| R7  | Integration (owner) | The dry-run output. **Expect:** `seeded-only`, two stores, two `VendorDomain` rows, exit 0. |
| R8  | Integration (owner) | The apply output. **Expect:** `committed:`, `OK: every copied model matches the plan.`, exit 0. |
| R9  | Integration (owner) | The `configure-env` output, exit 0. |
| R10 | Integration (owner) | The `grant-role` and `demo:accounts add` outputs. **Expect:** platform admin granted; six roster lines. |
| R11 | Integration | `gh pr view <N> --json baseRefName,headRefName,closingIssuesReferences` before merge. **Expect:** `main`, `staging`, and the intended list only. After merge, `git cat-file -p <merge>` shows two parents. |
| R12 | E2E (live) | `gh run watch` on `deploy-production`, then `curl -sS https://<host>/api/health` for both hosts. **Expect:** all four fields as R12 lists. |
| R13 | E2E (live) | `curl -sS -D - -X POST https://<host>/api/auth/sign-in/email` with Origin and a JSON body built by `node -e` from the files (never echoed). **Expect:** `HTTP/1.1 200` for both. |
| R14 | Integration (live) | `wrangler tail aheed-scheduler-production` with the production token. **Expect:** a `ran=none` line. |
| R15 | Integration | GraphQL node query per promoted issue. **Expect:** `Done`/closed. **Expect:** the follow-up issues exist with a Phase. |
| R16 | Unit | Read the guide in `env-setup.md` and the comment on `#1341`. |
| R17 | Unit | `git diff origin/staging -- CHANGELOG.md` names `#1341` and `#1325`. |
| R18 | Regression | Local commands, plus `kms:assemble:internal` and `next build` in `kms/site-internal`. **Expect:** CI green on each PR. |
