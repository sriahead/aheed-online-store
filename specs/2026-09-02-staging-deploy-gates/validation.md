# The staging deploy path is gated, and its own comment becomes true (validation)

> **Testing Strategy (Lean 80/20 Model)**
> Provide enough testing to give confidence without creating unnecessary or duplicate tests. Avoid testing the same behaviour multiple times at different levels unless doing so provides additional confidence.
>
> **The Main Principle:**
>
> - **Build:** Did we build the component correctly?
> - **Validate:** Does the feature work correctly in the real system?
> - **Release:** Is the complete system safe, reliable, and ready for users?

## What this slice is, for a validator with no memory of building it

Two changes, in two different systems. One is a **repository setting** (a GitHub ruleset) that
exists only on GitHub's side and is not represented by any file in this repo — so it is verified
with `gh api`, never by reading a file or a workflow. The other is a **workflow file** change. Most
rows below are therefore API queries or file reads, not application behaviour; there is no route to
curl and no database to touch.

**Read this before running the ruleset rows.** `gh api repos/sriahead/aheed-online-store/branches/staging/protection`
is **not** a valid way to check any of this. It queries *classic* branch protection and returns
`404 Branch not protected` whether or not a ruleset is active — that exact mistake is what made a
previous verification structurally incapable of finding the thing it concluded was absent (#537,
corrected in `CLAUDE.md` on 2026-09-02). Use the `rulesets` and `rules/branches` endpoints below.

**Ordering note.** Run R13 and R14 before R17. R13 can legitimately modify generated artefacts if
they were stale; establishing a clean tree first makes R17's result unambiguous.

---

## Validation Steps

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1 | Integration | `gh api repos/sriahead/aheed-online-store/rulesets --jq '.[] \| select(.name=="protect-staging") \| {id,target,enforcement}'` prints one object with `target: "branch"` and `enforcement: "active"`. Then, using that `id`: `gh api repos/sriahead/aheed-online-store/rulesets/<id> --jq '.conditions.ref_name'` prints `include` of exactly `["refs/heads/staging"]` and `exclude` of `[]`. |
| R2 | Integration | With the same `id`: `gh api repos/sriahead/aheed-online-store/rulesets/<id> --jq '[.rules[].type] \| sort'` prints exactly `["deletion","non_fast_forward","pull_request"]` (three entries, no more). `... --jq '.rules[] \| select(.type=="pull_request") \| .parameters \| {required_approving_review_count, require_code_owner_review}'` prints `0` and `false`. `... --jq '.bypass_actors'` prints `[]`. |
| R3 | Integration | `gh api repos/sriahead/aheed-online-store/rules/branches/staging --jq '[.[].type]'` includes `pull_request`. This is the row that proves the ruleset is *evaluated for* `staging`; R1/R2 only prove it is *declared*. A ruleset created with a mistyped ref condition passes R1 and fails here. |
| R4 | Regression | `gh api repos/sriahead/aheed-online-store/rules/branches/main --jq '[.[].type]'` still includes `pull_request`, and `gh api repos/sriahead/aheed-online-store/rulesets --jq '.[] \| select(.name=="protect-main") \| .enforcement'` still prints `"active"`. |
| R5 | Integration | `gh api repos/sriahead/aheed-online-store/rules/branches/feature%2Fstaging-deploy-gates --jq '[.[].type]'` does **not** include `pull_request` (an empty array `[]` is the expected result). Confirms the ref condition is `staging`-only rather than matching every branch. If validating from a differently-named branch, URL-encode that branch's name instead (`/` becomes `%2F`). |
| R6 | Unit | `grep -n -A3 "^  quality:" .github/workflows/deploy-staging.yml` shows `uses: ./.github/workflows/quality.yml` and, under `with:`, `kms_blocking: false`. |
| R7 | Unit | `grep -n "needs: quality" .github/workflows/deploy-staging.yml` returns exactly one line, inside the `deploy` job. |
| R8 | Regression | `grep -n "opennextjs-cloudflare build\|prisma migrate deploy\|wrangler deploy" .github/workflows/deploy-staging.yml` prints the three matches in that order, with ascending line numbers. Guards #434's build-before-migrate ordering against an accidental reshuffle. |
| R9 | Unit | `grep -rn "Deliberately NO quality job" .github/` returns no matches. `grep -n "protect-staging" .github/workflows/deploy-staging.yml` returns at least one line, and the comment around it also mentions `quality.yml`. **Scope the grep to `.github/`** — a repo-wide grep returns four matches for a *correct* implementation (`specs/2026-09-02-staging-deploy-gates/plan.md` quotes the removed comment as historical context; that quotation propagates into `app/(admin)/staff/runbook/docs.ts` and `kms/site-internal/content/`; and this row's own search string appears in `validation.md`). |
| R10 | Unit | `grep -n "protect-staging" CLAUDE.md` returns at least one line. Read the surrounding "Branch strategy & CI/CD" bullet and confirm it states `staging` is covered by an active ruleset requiring a pull request, zero approving reviews, no status checks, no bypass actors. Confirm `grep -n "staging. is not covered at all\|main. only, .staging. is not covered" CLAUDE.md` returns no matches. |
| R11 | Unit | Read `CLAUDE.md`'s "Branch strategy & CI/CD" section and confirm it states that neither ruleset carries a `required_status_checks` rule and that a red PR can still be merged into either branch. `grep -n "#472" CLAUDE.md` returns at least one line in that section. |
| R12 | Unit | Read the same section and confirm it states `deploy-staging.yml` calls `quality.yml` with `kms_blocking: false`. `grep -n "kms_blocking" CLAUDE.md` returns at least one line referring to the staging path. |
| R13 | Integration | `npm run kms:check-generated` exits 0 and prints a `✓` line for both `ARTIFACT_INDEX.md` and `app/(admin)/staff/runbook/docs.ts`. Then `git status --porcelain` prints no line for either path. (If this fails, the fix is `npm run kms:build-index` and committing the result — editing `CLAUDE.md`'s body stales `docs.ts` while leaving `ARTIFACT_INDEX.md` byte-identical.) |
| R14 | Integration | `npm run kms:validate` exits 0. Then `npm run kms:assemble:internal` followed by `cd kms/site-internal && npx next build --webpack`, both exiting 0. **Do not pipe either command through `head`/`tail`** — that reports the pipe's exit status, not the build's, which is how a failing build has previously looked green here. Redirect to a file and read it if the output is long. |
| R15 | E2E | **Deferred to Ship — cannot pass before merge, by construction.** `deploy-staging` triggers only on a push to `staging`, so no run of the modified workflow can exist while this branch is unmerged. At `/ship`, after the PR merges: `gh run list --workflow deploy-staging.yml --branch staging --limit 1 --json databaseId --jq '.[0].databaseId'`, then `gh run view <id> --json conclusion,jobs` shows `quality`, `kms` and `deploy` jobs present, with `deploy` having started only after `quality` concluded `success`. Report this row as deferred at `/validate` rather than blocking on it. |
| R16 | Acceptance | `git diff --name-only origin/staging...HEAD \| grep -qx 'CHANGELOG.md'` exits 0, and the new entry names #539. |
| R17 | Regression | `npm run lint`, `npm run typecheck`, `npm test` and `npm run format:check` each exit 0. **Known local-only noise:** `tests/repository-transaction-safety.test.ts` can exceed its 5000ms timeout under full-suite load on Windows while passing in isolation — that is **#538**, pre-existing and not this slice's. CI's Linux runners are the authority; confirm there rather than locally if it fires. |

<!--
  R1/R2 read the ruleset's declaration; R3 reads what GitHub actually applies to the branch. Both
  are needed — the failure mode a ruleset has is being created successfully with a condition that
  matches nothing, which only R3 detects.
-->
