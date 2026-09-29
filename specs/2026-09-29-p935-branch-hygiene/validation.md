# #935 — Branch hygiene: /prune-branches and an Orient reminder (validation)

> **Testing Strategy (Lean 80/20 Model)**
> Provide enough testing to give confidence without creating unnecessary or duplicate tests. Avoid testing the same behaviour multiple times at different levels unless doing so provides additional confidence.
>
> **The Main Principle:**
> - **Build:** Did we build the component correctly?
> - **Validate:** Does the feature work correctly in the real system?
> - **Release:** Is the complete system safe, reliable, and ready for users?

## Testing Areas

This slice is git and GitHub tooling only. It touches no database, no Worker runtime and no UI, so
there is no `npm run preview` step.

- **Unit** tests cover the pure planner (R1–R7).
- **Integration** covers deletion, using a throwaway repo with a bare origin (R14).
- **System** is a **dry run only** against this real repo (R9, R10, R13). Validate must **never**
  run `--apply` against this repo. The first real prune is the user's, after merge (see `plan.md`).

Run the Bash commands from the repo root, in the Bash tool. Commands that call `gh` need the
`GH_TOKEN=$(gh auth token -u sriahead)` prefix.

---

## Validation Steps

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1  | Unit | `grep -cE "node:child_process\|node:fs" scripts/branch-hygiene.ts` prints `0`. `grep -cE "export (function\|const) (planPrune\|countVerdict)" scripts/branch-hygiene.ts` prints `2`. |
| R2  | Unit | `npx vitest run tests/branch-hygiene.test.ts` exits 0. Read `planPrune`: its return type has exactly three lists (KEEP, DELETE, REVIEW), and a test asserts that the three lists together hold every input copy exactly once. |
| R3  | Unit | Tests (a) and (b) in `tests/branch-hygiene.test.ts` pass. Check the (a) and (b) assertions against R3 by reading them. |
| R4  | Unit | Test (c) passes. |
| R5  | Unit | Tests (d) and (e) pass, and they assert the exact reason strings `not merged` and `open PR #<n>`. |
| R6  | Unit | Test (g) passes and asserts `false` at 29/29, and `true` at 30/0 and 0/30. |
| R7  | Unit | `grep -c "it(\|test(" tests/branch-hygiene.test.ts` is at least 7. Each of the cases (a)–(g) can be traced to a named test. |
| R8  | Unit | `node -e "const s=require('./package.json').scripts;console.log(s['branches:prune'],'|',s['branches:count'])"` prints `tsx scripts/prune-branches.ts prune \| tsx scripts/prune-branches.ts count`. |
| R9  | System | Run `git fetch --prune origin`. Then run `git for-each-ref --format='%(refname) %(objectname)' refs/heads refs/remotes/origin > "$TMP/before.txt"`. Then run `GH_TOKEN=$(gh auth token -u sriahead) npm run branches:prune > "$TMP/dry.txt"; echo $?`, which prints `0`. Repeat the `for-each-ref` into `after.txt`: `diff "$TMP/before.txt" "$TMP/after.txt"` prints nothing. `dry.txt` has the headings `KEEP (`, `DELETE (` and `REVIEW (`, and its last non-empty line starts `Dry run — nothing deleted.`. The KEEP section contains `main`, `staging` and the current branch. For every `origin/<name>` line under DELETE, `git merge-base --is-ancestor origin/<name> origin/staging \|\| git merge-base --is-ancestor origin/<name> origin/main` exits 0; loop over them all. |
| R10 | System | Run `GH_TOKEN=$(gh auth token -u sriahead) gh pr list --state open --json headRefName --jq '.[].headRefName'`. Every head listed there that is not among the kept names appears under REVIEW in `dry.txt` with `open PR #`, and appears nowhere under DELETE. Then run `GH_TOKEN=invalid npm run branches:prune; echo $?`: it prints a non-zero code and an error mentioning `gh`. The integration test in R14 covers the `BRANCH_HYGIENE_OPEN_PRS` override. |
| R11 | Integration | `npx vitest run tests/prune-branches.integration.test.ts` exits 0. Read the test: it asserts the post-`--apply` state of local refs **and** of the bare origin's refs. Read `scripts/prune-branches.ts`: origin deletions use `git push origin --delete` in chunks of 50 or fewer, and local deletions use `git branch -D`. Validate does **not** run `--apply` on the real repo. |
| R12 | Unit | `npm run branches:prune -- --keep 0; echo $?` and `npm run branches:prune -- --keep abc; echo $?` both print a non-zero code. `GH_TOKEN=$(gh auth token -u sriahead) npm run branches:prune -- --keep 3` shows exactly 3 names in KEEP, besides `main`, `staging` and the current branch. |
| R13 | System | `npm run branches:count; echo $?` prints `Branches: local <n>, origin <m> (reminder at 30)` and `0`. Before the first real prune, both counts are above 30, so an `ACTION:` line naming `/prune-branches` is present. The counts match `git branch \| wc -l` and `git branch -r \| grep -v HEAD \| wc -l`. Nothing in `scripts/prune-branches.ts`'s `count` path calls `push --delete` or `branch -D`. |
| R14 | Integration | Same run as R11. The test file exists at `tests/prune-branches.integration.test.ts`. It sets `GIT_COMMITTER_DATE` and `BRANCH_HYGIENE_OPEN_PRS`. It asserts that the dry run changes no refs, and that after `--apply --keep 2` the unmerged branch and the open-PR branch still exist both locally and in the bare origin. |
| R15 | Unit | `.claude/commands/prune-branches.md` exists and begins with a `description:` front-matter line. Reading it, the four instructions of R15 appear in order, and the `GH_TOKEN=$(gh auth token -u sriahead)` note is present. |
| R16 | Unit | `grep -n "branches:count" .claude/commands/orient.md specs/sdd-workflow.md` finds at least one line in each file. The orient step says that `ACTION:` is reported and that the step does not block. `git diff origin/staging -- specs/sdd-workflow.md` shows the minor `version` bump and `updated: 2026-09-29`. |
| R17 | Unit | `grep -n "branches:count" CLAUDE.md` and `grep -n "branches:prune" CLAUDE.md` each match on the `## Commands` line. |
| R18 | Gate | `grep -c "specs/2026-09-29-p935-branch-hygiene/plan.md" ARTIFACT_INDEX.md` prints `1`. `npm run kms:validate` exits 0. `npm run kms:check-generated` exits 0. |
| R19 | Gate | `git diff origin/staging -- CHANGELOG.md` shows a `#935` entry. |
| R20 | Gate | `npm run lint`, `npm run typecheck` and `npm run format:check` each exit 0. `npx vitest run` exits 0 and reports no failed files; run it alone, not beside a build. CI `gates` on the PR is green; per the loop, CI is ground truth. |
