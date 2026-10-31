# Docs Access guard and the `docs-shoplocal.merqify.com` host (validation)

> **Testing Strategy (Lean 80/20 Model)**
> Unit tests prove the decision functions; the live rows prove the script against the real
> Cloudflare API and real hosts, because a hand-built double only reproduces its author's guess of
> the API shape (`CLAUDE.md`, Database section, same lesson). The positive live row is owner-gated
> and must be reported **UNVERIFIED**, not passed, until `#1339` is done.

**Setup for the live rows.** Run from the repository root in Git Bash. Check the process environment
first (`CLAUDE.md`): for each of `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, test
`if printenv "$v" >/dev/null 2>&1` one variable at a time and `unset` any that is set, so
`--env-file` is the only source. `secrets/merqify-staging.vars` must exist with both values filled;
it is git-ignored and owner-provided. Never print either value.

## Validation Steps

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1  | Unit | `grep -nE '^(pattern\|custom_domain\|workers_dev)' kms/site-internal/wrangler.toml` prints exactly three lines: `workers_dev = false`, `pattern = "docs-shoplocal.merqify.com"`, `custom_domain = true`. |
| R2  | Unit | `npx vitest run tests/worker-routes.test.ts` exits 0, and the R4 test's `toEqual` literal reads `["docs-shoplocal.merqify.com"]`. |
| R3  | Integration | Each of these exits 1 and prints a usage or reason line: `npx tsx scripts/verify-docs-access.ts`; `npx tsx scripts/verify-docs-access.ts --pre --post`; `npx tsx scripts/verify-docs-access.ts --post --config <empty temp file>`. Check the exit code with `echo $?` after each. |
| R4  | Integration | `env -u CLOUDFLARE_API_TOKEN -u CLOUDFLARE_ACCOUNT_ID npx tsx scripts/verify-docs-access.ts --pre` exits 1 and names `CLOUDFLARE_ACCOUNT_ID` or `CLOUDFLARE_API_TOKEN`. Read the source: the missing-value check runs before any `fetch`. |
| R5  | Unit | Read `scripts/verify-docs-access.ts`: the URL is `https://api.cloudflare.com/client/v4/accounts/<id>/access/apps`, and the loop requests further pages until `result_info` says the last page is read. A unit test with a two-page fixture fetcher proves an app on page 2 is seen. |
| R6  | Unit | `npx vitest run tests/docs-access-guard.test.ts` exits 0 (the R11 cases cover the coverage and policy rules). |
| R7  | Integration | `CLOUDFLARE_ACCOUNT_ID=0000 CLOUDFLARE_API_TOKEN=invalid npx tsx scripts/verify-docs-access.ts --pre` exits 1 (real API, rejected token). Read the source: a 403 message contains `Access: Apps and Policies Read`, and `success: false` and network errors both exit 1. |
| R8  | Unit | `npx vitest run tests/docs-access-guard.test.ts` exits 0, with the 302-to-`cloudflareaccess.com` pass case and the 302-elsewhere fail case present. Read the source for the two URLs and `redirect: "manual"`. |
| R9  | Unit | Same test file: a 200 fails with no retry; read the source for at least 6 attempts at 20-second spacing for network errors and other statuses. |
| R10 | Integration | Run the R13 command with `2>&1 \| grep -cF "$(sed -nE 's/^CLOUDFLARE_API_TOKEN *= *"?([^"]*)"?.*/\1/p' secrets/merqify-staging.vars)"`: prints `0`. |
| R11 | Unit | `npx vitest run tests/docs-access-guard.test.ts` exits 0 and the file contains every case R11 lists (read the `it(` titles). |
| R12 | Unit | Same test file passes its workflow-order and `workers_dev = false` tests; also read `.github/workflows/deploy-docs-internal.yml` and confirm the `--pre` step sits between the root `npm ci` and the `wrangler deploy` step, and `--post` after it. |
| R13 | E2E | Setup above, then `npx tsx scripts/verify-docs-access.ts --pre --env-file secrets/merqify-staging.vars; echo "exit=$?"` prints `exit=1` with either `no Access application covers docs-shoplocal.merqify.com` or the R7 permission text. Record which. If it exits 0, the owner has already created the application: record that and treat R15's first half as checked instead. |
| R14 | E2E | `printf 'pattern = "example.com"\n' > "$TEMP/t.toml"; npx tsx scripts/verify-docs-access.ts --post --config "$TEMP/t.toml"; echo "exit=$?"` prints `exit=1` and reports a non-redirect response (example.com answers 200). |
| R15 | E2E | **Owner-gated.** After `#1339`: the R13 command prints `exit=0`; after the first deploy to the Merqify account, `gh run view <deploy-docs-internal run id> --log` shows the `--post` step passing for both URLs. Until then, report **UNVERIFIED** with the reason. |
| R16 | Unit | `grep -rn 'docs\.merqify\.com' .github docs/developer-portal kms/site-internal/wrangler.toml specs/architecture.md` prints nothing (exit 1). |
| R17 | Unit | Read the "Merqify account" section of `docs/developer-portal/env-setup.md`: the hosts table, owner step 2 and cut-over step 7 name `docs-shoplocal.merqify.com`, and the section describes the `--pre` and `--post` checks and the `Access: Apps and Policies Read` permission. |
| R18 | Unit | `npm run kms:validate` exits 0; `npm run kms:check-generated` prints `all 2 generated artefact(s) current`; `npm run kms:assemble:internal && (cd kms/site-internal && npx next build --webpack); echo "exit=$?"` prints `exit=0` (read the real exit status, not a piped one). |
| R19 | Unit | `git diff origin/staging -- CHANGELOG.md` shows an entry naming `#1328`. |
| R20 | Regression | `npm run lint`, `npm run typecheck`, `npm run format:check` each exit 0; `npx vitest run --maxWorkers=4` exits 0 (run alone, `CLAUDE.md`). CI on the PR is ground truth. |
