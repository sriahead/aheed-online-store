# Every generated KMS artefact is checked, on both CI paths (validation)

> **Testing Strategy (Lean 80/20 Model)**
> Provide enough testing to give confidence without creating unnecessary or duplicate tests. Avoid testing the same behaviour multiple times at different levels unless doing so provides additional confidence.
>
> **The Main Principle:**
> - **Build:** Did we build the component correctly?
> - **Validate:** Does the feature work correctly in the real system?
> - **Release:** Is the complete system safe, reliable, and ready for users?

## Testing Areas

This slice is CI and developer tooling. It touches no route, no database and no rendered UI, so
there is nothing to check under `npm run preview` and no Workers-runtime concern — the "real
system" here is the two CI paths and the local pre-clear script, and those are what the rows below
exercise. The one genuinely runtime-ish check is R4, which induces real drift and confirms the
checker fails on it; a checker that has only ever been observed passing has not been tested.

1. **Unit Testing** — R16 guards the output list against silently narrowing.
2. **Integration Testing** — R3, R4, R6, R8 run the real scripts against the real repository.
3. **System / End-to-End Testing** — R13 and R11 are confirmed by the actual `gates` run on this
   slice's pull request, not only by reading YAML.
4. **Regression & Acceptance Testing** — R18 is the standing green-suite gate.

> **Ordering note.** Run R9 **before** R4. R4 deliberately dirties a document to induce drift, and
> R9 asserts the tree is already current; running them the other way round makes R9 ambiguous.

---

## Validation Steps

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1  | Unit | `grep -n "GENERATED_ARTIFACTS" kms/scripts/build-index.ts` shows an exported array; confirm by eye it holds exactly `ARTIFACT_INDEX.md` and `app/(admin)/staff/runbook/docs.ts`, and that the two `writeFileSync` calls in `main()` write those paths and no others. |
| R2  | Integration | `node -e "const p=require('./package.json');console.log(p.scripts['kms:check-generated'])"` prints a command running `kms/scripts/check-generated.ts`. `grep -n "GENERATED_ARTIFACTS" kms/scripts/check-generated.ts` shows it imported, and `grep -cE "ARTIFACT_INDEX\.md|runbook/docs\.ts" kms/scripts/check-generated.ts` returns `0` — the list is not restated. |
| R3  | Integration | On a clean tree (`git status --porcelain` empty): `npm run kms:check-generated; echo "EXIT=$?"` prints `EXIT=0` and one line naming each of the two checked paths. |
| R4  | Integration | Induce real drift in the file the old check was blind to — append a line to the **body** of `specs/roadmap.md` (below its front-matter, leaving `version`/`updated` untouched), then `npm run kms:check-generated; echo "EXIT=$?"`. Expect a non-zero `EXIT`, an `::error::` line naming `app/(admin)/staff/runbook/docs.ts`, and no claim that the run passed. Then also touch `ARTIFACT_INDEX.md`'s content (edit a doc's front-matter `summary`) and re-run: **both** paths must be named in one run. Restore with `git checkout -- specs/roadmap.md <the other doc> ARTIFACT_INDEX.md "app/(admin)/staff/runbook/docs.ts"` and confirm `git status --porcelain` is empty again. |
| R5  | Unit | Read `kms/scripts/check-generated.ts`: confirm the footer-normalising replace covers both `` Last build: `...` `` and `` commit `...` ``, that it is applied to `ARTIFACT_INDEX.md` only, and that a `\r\n` to `\n` replacement is applied to every file before comparison. |
| R6  | Integration | With the tree clean, `npm run kms:check-generated` then `git status --porcelain` — output must be empty. (The rebuild rewrites `ARTIFACT_INDEX.md`'s footer with a new timestamp every time, so a non-empty result here means the restore is not happening.) |
| R7  | Unit | `grep -nE "checkArtifactIndexStale\|normaliseIndexFooter" scripts/sdd-check.ts` returns nothing, and `grep -n "kms:check-generated" scripts/sdd-check.ts` shows the preclear path shelling out to it. |
| R8  | Integration | On a clean tree, `npm run sdd:preclear` then `git status --porcelain "app/(admin)/staff/runbook/docs.ts"` — output must be empty. This is the exact defect that produced the inherited dirty file, so an empty result is the whole point of the row. |
| R9  | Integration | **Run this before R4.** On a clean tree, `npm run kms:build-index` then `git diff --exit-code -- "app/(admin)/staff/runbook/docs.ts"; echo "EXIT=$?"` prints `EXIT=0`. |
| R10 | Unit | `sed -n '1,30p' .github/workflows/quality.yml` shows an `on: workflow_call:` block with an `inputs:` entry `kms_blocking`, `type: boolean`, `default: true`. |
| R11 | Unit + E2E | `grep -nE "^  kms:|continue-on-error|kms:validate|kms:check-generated" .github/workflows/quality.yml` shows a top-level `kms:` job, separate from `quality:`, running both npm scripts, with `continue-on-error` referencing `inputs.kms_blocking`. E2E half: the `gates` run on this slice's PR shows `kms` as its own check and it is green (`gh pr checks <PR>`). |
| R12 | Unit | `grep -nA3 "uses: ./.github/workflows/quality.yml" .github/workflows/deploy-production.yml` shows a `with:` block setting `kms_blocking: false`; `grep -n "needs: quality" .github/workflows/deploy-production.yml` still matches. |
| R13 | Unit + E2E | `grep -nE "kms:validate|ARTIFACT_INDEX|kms:check-generated" .github/workflows/gates.yml` returns nothing; `grep -n "CHANGELOG" .github/workflows/gates.yml` still matches the Gate 4 step. E2E half: `gates` passes on this slice's PR (`gh pr checks <PR>`), proving the remaining `docs-gates` job is still valid YAML and still runs. |
| R14 | Unit | `grep -rn "base_ref" .github/workflows/ CLAUDE.md` — every surviving mention must be about the Gate 4 CHANGELOG diff. Specifically, no hit may associate `base_ref` with the staleness check. |
| R15 | Unit | `grep -n "protect-main" CLAUDE.md` matches, and the surrounding text states: pull request required, zero approvals required, no required status checks, no bypass actors, `staging` not covered, and that `gh api ... /branches/main/protection` returns 404 regardless because it cannot see rulesets. Cross-check the claim is still true: `gh api repos/sriahead/aheed-online-store/rulesets --jq '.[] | "\(.name) \(.enforcement)"'` prints `protect-main active`. |
| R16 | Unit | `npx vitest run tests/kms-generated-artifacts.test.ts` exits 0. Then confirm it actually bites: temporarily delete one entry from `GENERATED_ARTIFACTS`, re-run, see it fail, and restore. |
| R17 | Unit | `git diff origin/staging...HEAD --name-only \| grep -qx CHANGELOG.md; echo "EXIT=$?"` prints `EXIT=0`. |
| R18 | Regression | `npm run lint && npm run typecheck && npm test && npm run format:check` all exit 0. CI on the PR is the authority, not local output — confirm with `gh pr checks <PR>` once opened. |
