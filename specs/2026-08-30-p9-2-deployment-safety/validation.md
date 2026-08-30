# P9.2 — Production deployment safety (validation)

> **Testing Strategy (Lean 80/20 Model)**
> Provide enough testing to give confidence without creating unnecessary or duplicate tests. Avoid testing the same behaviour multiple times at different levels unless doing so provides additional confidence.
>
> **The Main Principle:**
> - **Build:** Did we build the component correctly?
> - **Validate:** Does the feature work correctly in the real system?
> - **Release:** Is the complete system safe, reliable, and ready for users?

## Testing Areas

The artifact here is CI/CD configuration, so the usual unit/integration split does not map cleanly:
there is no application code to unit-test, and the only "real system" is GitHub Actions itself.
Rows are therefore split between **Static** (the YAML says what it must say — cheap, and enough for
the structural requirements) and **System** (a workflow actually ran and behaved as claimed).

**The distinction matters more than usual for this slice.** A static check proves the file was
edited; it does not prove the ordering change has any effect. R10 is the row that carries the real
claim, and it must not be substituted with "the YAML looks right" — that substitution is precisely
what happened in #459, where a `200 OK` on a healthy page was recorded as evidence for an error
boundary that page never exercises.

**Where a run cannot be exercised before merge, say so rather than approximating it.**
`deploy-production` triggers only on `push` to `main`, so R6 is verified statically here and is
finally confirmed by the first real production deploy after promotion. R10 proves the identical
ordering change live on `deploy-staging`.

**Why R10's scratch run is safe to perform.** Verified on 2026-08-30: the `staging` GitHub
environment has no protection rules and no deployment-branch policy
(`gh api repos/sriahead/aheed-online-store/environments/staging` returns `"protection_rules": []`,
`"deployment_branch_policy": null`), so a scratch branch can run the workflow and reach its
secrets — the run will not stall waiting for an approval that never comes. And because this slice
adds no migration, `prisma migrate deploy` is a no-op even in the failure case where the ordering
fix did *not* work, so the experiment cannot alter the staging schema either way.

---

## Validation Steps

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1  | Static | `node -e "const y=require('js-yaml'),fs=require('fs');console.log(JSON.stringify(Object.keys(y.load(fs.readFileSync('.github/workflows/quality.yml','utf8')).on)))"` prints exactly `["workflow_call"]`. (`js-yaml` is already in `node_modules` via gray-matter — no install needed. Confirmed on 2026-08-30 that js-yaml 4 keeps `on` as the string key `on`, not the YAML 1.1 boolean `true`, so `d.on` is the right accessor.) |
| R2  | Static | `node -e "const y=require('js-yaml'),fs=require('fs');const d=y.load(fs.readFileSync('.github/workflows/quality.yml','utf8'));const j=Object.keys(d.jobs);const runs=d.jobs[j[0]].steps.map(s=>s.run).filter(Boolean).join('\n');console.log(j.length,['db:generate','lint','format:check','typecheck','test'].every(c=>runs.includes(c)))"` prints `1 true` — exactly one job, and all five checks appear as `run:` steps inside it. |
| R3  | Static | `grep -nE 'run: npm (run )?(lint\|format:check\|typecheck\|test\|db:generate)' .github/workflows/gates.yml` produces **no output** (exit 1), and `grep -c 'uses: ./.github/workflows/quality.yml' .github/workflows/gates.yml` prints `1`. |
| R4  | Static | `grep -c 'ARTIFACT_INDEX.md is stale' .github/workflows/gates.yml` prints `1`; `grep -c 'Gate 4 failed' .github/workflows/gates.yml` prints `1`; and the job containing them has a `needs:` naming the quality job — confirm by reading the file. |
| R5  | Static | `grep -c 'uses: ./.github/workflows/quality.yml' .github/workflows/deploy-production.yml` prints `1`, and the deploying job's `needs:` names that job — confirm by reading the file. |
| R6  | Static | `grep -n -e 'opennextjs-cloudflare build' -e 'prisma migrate deploy' .github/workflows/deploy-production.yml` — confirm the `opennextjs-cloudflare build` line number is **lower** than the `prisma migrate deploy` line number. |
| R7  | Static | Same command against `.github/workflows/deploy-staging.yml`; confirm the same ordering. |
| R8  | Static | `grep 'quality.yml' .github/workflows/deploy-staging.yml` produces no output (exit 1). |
| R9  | Static | `grep -in 'required reviewer' .github/workflows/deploy-production.yml` produces no output (exit 1), and reading the `environment: production` line shows a comment stating no approval gate is enforced on the current plan. |
| R10 | System | On a scratch branch `scratch/verify-434` cut from this feature branch: (a) edit `.github/workflows/deploy-staging.yml`'s `branches:` to `[scratch/verify-434]`; (b) introduce a deliberate build failure — append `import "./__deliberate_missing_module__";` to `lib/config.ts`, which webpack fails to resolve. (A type error would also work — `next.config.mjs` sets no `typescript.ignoreBuildErrors`, so Next still typechecks — but an unresolvable import fails faster and stays a build failure even if that setting later changes.) (c) push. Then `gh run list --branch scratch/verify-434 --workflow deploy-staging` and, on that run id, `gh run view <id> --json jobs -q '.jobs[].steps[] \| "\(.name) => \(.conclusion)"'`. **Confirm the build step's conclusion is `failure` and the "Apply migrations (direct connection)" step's conclusion is `skipped`.** Then delete the branch (`git push origin --delete scratch/verify-434`) and confirm no migration ran against staging: this slice adds no migration, so `npx prisma migrate status` against `DIRECT_URL` from `secrets/staging.vars` reports no pending or newly-applied migration. |
| R11 | System | On this slice's PR: `gh pr checks <PR#>` shows `gates` as `pass`, and `gh run view <gates-run-id> --json jobs -q '.jobs[].name'` lists the reusable quality job as its own entry alongside the docs-gates job. |
| R12 | Static | `git diff --name-only origin/staging...HEAD \| grep -qx 'CHANGELOG.md'` exits 0, and the new entry names `#434` and `#435`. |
| R13 | Static | `npm run lint`, `npm run typecheck`, `npx vitest run`, `npm run format:check` each exit 0 locally, and the PR's `gates` run is green (CI, not local output, is ground truth). |

## Cleanup checklist for R10

The scratch-branch experiment leaves three things behind that must be removed before the slice is
considered validated, because each would otherwise ship or mislead:

1. The scratch branch itself, locally and on the remote.
2. The deliberate build failure in `lib/config.ts` — confirm `git status` on the feature branch is
   clean and `lib/config.ts` matches `origin/staging`.
3. The temporary `branches:` edit in `deploy-staging.yml` — confirm the committed file triggers on
   `[staging]` and nothing else.

Run `git diff origin/staging...HEAD -- .github/workflows/deploy-staging.yml lib/config.ts` and read
it in full before opening the PR; the only staging-workflow change that may appear is the build /
migrate reordering.
