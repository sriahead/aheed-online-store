# #938 and #939 — Local tooling fixes (validation)

> **Testing Strategy (Lean 80/20 Model)**
> Provide enough testing to give confidence without creating unnecessary or duplicate tests. Avoid testing the same behaviour multiple times at different levels unless doing so provides additional confidence.
>
> **The Main Principle:**
> - **Build:** Did we build the component correctly?
> - **Validate:** Does the feature work correctly in the real system?
> - **Release:** Is the complete system safe, reliable, and ready for users?

## Testing Areas

This slice changes local tooling only: a test's timeout, and a git-driven CLI script. It has no
Worker, database, UI, auth or payment surface, so the areas that apply are:
- **Unit:** the pure `planPrune` rule.
- **Integration:** the prune CLI against a throwaway repository with a real second worktree.
- **System:** one dry run against this real repository.
- **Regression:** the full suite, lint, typecheck and format.

Validation **never** runs `--apply` against the real repository.

Base for every `git diff` below: `origin/staging` at the point the branch was cut (`b811ccc`). If
`origin/staging` has since moved, use `git diff b811ccc -- <path>` instead.

---

## Validation Steps

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1  | Unit | `grep -n "30_000" tests/vendor-neutral-copy.test.ts` matches the closing line of the "no shipped UI file contains…" test (`}, 30_000);`). A comment containing `#938` sits within 3 lines of it. |
| R2  | Regression | `git diff b811ccc -- tests/vendor-neutral-copy.test.ts` shows only: the closing `});` of the scanning test becoming `}, 30_000);`, plus the added `#938` comment line(s). No other line changes. `git diff b811ccc --stat -- 'vitest.config*'` prints nothing. |
| R3  | Unit | Run `npx vitest run tests/vendor-neutral-copy.test.ts` alone. It exits 0 and reports `2 passed`. |
| R4  | Unit | `grep -cE "node:child_process\|node:fs" scripts/branch-hygiene.ts` prints `0`. Read `planPrune`'s signature: the fifth parameter is `worktrees: ReadonlyMap<string, string>` with a default of `new Map()` (or equivalent empty map). |
| R5  | Unit | Read `planPrune`: the worktree check applies only when `copy.location === "local"`, and only on the path that would otherwise push to `plan.delete`. The reason is built as `` `checked out in worktree ${path}` ``. The R10 test asserts the exact string. |
| R6  | Unit | The R10 test asserts the origin copy is in DELETE. `npx vitest run tests/branch-hygiene.test.ts` exits 0, which includes every pre-existing case (a)–(g) unchanged. `git diff b811ccc -- tests/branch-hygiene.test.ts` shows only added lines. Read `planPrune`: the `not merged` / `open PR #<n>` reason branch is untouched. |
| R7  | Unit | Read `scripts/prune-branches.ts`: the `prune` function calls `git worktree list --porcelain` and parses it into a `Map`. Keys come from `branch refs/heads/` lines with the prefix stripped; values come from the block's `worktree ` line. The map is passed as `planPrune`'s fifth argument. The R11 integration test is the behavioural proof. |
| R8  | Unit | Read `prune`: the worktree call runs before the `console.log("KEEP …")` line. On failure it logs an error containing `git worktree list` and returns `1`, and no deletion code is reachable on that path. There is no live check, because forcing git to fail here would need a broken repository. |
| R9  | System | `grep -n "worktree" scripts/prune-branches.ts` shows no match inside the `count` function. `npm run branches:count; echo $?` prints the `Branches: local <n>, origin <m>` line and `0`. |
| R10 | Unit | `npx vitest run tests/branch-hygiene.test.ts` exits 0. Read the new test: it asserts the local copy is in REVIEW with the exact `checked out in worktree <path>` reason, the origin copy is in DELETE, and a second call with no fifth argument puts both copies in DELETE. |
| R11 | Integration | `npx vitest run tests/prune-branches.integration.test.ts` exits 0. Read the new test and confirm all of these:<br>- it is the last `it(...)` in the file;<br>- it runs `git worktree add`;<br>- it asserts that `git branch -D` of the worktree branch throws before running the CLI;<br>- it runs `prune --apply --keep 2` through `cli(...)`, which throws on a non-zero exit;<br>- it asserts the `checked out in worktree` REVIEW line, the local branch surviving, and the branch gone from the bare origin's `refs/heads`.<br>`git diff b811ccc -- tests/prune-branches.integration.test.ts` shows no changed expectation in the existing tests, and "count" still expects `local 6, origin 6`. **Red proof:** with a clean tree, run `git show b811ccc:scripts/prune-branches.ts > scripts/prune-branches.ts` and `git show b811ccc:scripts/branch-hygiene.ts > scripts/branch-hygiene.ts`. Re-run `npx vitest run tests/prune-branches.integration.test.ts`: the `wt-held` test must now fail, because the old `--apply` exits 1. Then restore with `git checkout HEAD -- scripts/prune-branches.ts scripts/branch-hygiene.ts`, and confirm `git status --short scripts/` prints nothing. |
| R12 | Unit | `grep -n "checked out in worktree" .claude/commands/prune-branches.md` matches. The same file contains `git worktree remove` and `git worktree prune`, and says to re-run the dry run. `grep -n -i "worktree" scripts/prune-branches.ts` matches inside the top-of-file comment block. |
| R13 | Integration | `npx vitest run tests/branch-hygiene.test.ts tests/prune-branches.integration.test.ts` exits 0 with no failed files. |
| R14 | System | Run all of this in Bash:<br>`git fetch --prune origin`<br>`git for-each-ref --format='%(refname) %(objectname)' refs/heads refs/remotes/origin > "$TMP/before.txt"`<br>`GH_TOKEN=$(gh auth token -u sriahead) npm run branches:prune > "$TMP/dry.txt"; echo $?`<br>The last command prints `0`. Repeat the `for-each-ref` into `after.txt`: `diff "$TMP/before.txt" "$TMP/after.txt"` prints nothing. Then list the worktree branches with `git worktree list --porcelain \| sed -n 's#^branch refs/heads/##p'`. For each branch other than `git branch --show-current`, `sed -n '/^DELETE/,/^REVIEW/p' "$TMP/dry.txt" \| grep -c "local <name>$"` prints `0`. If only the main checkout exists, record "no other worktrees; R11 is the proof". |
| R15 | Gate | `grep -c "specs/2026-09-29-p938-939-local-tooling-fixes/plan.md" ARTIFACT_INDEX.md` prints `1`. `npm run kms:validate` exits 0. `npm run kms:check-generated` exits 0. `npm run kms:assemble:internal` exits 0, then `npm run build` in `kms/site-internal` exits 0. |
| R16 | Gate | `git diff b811ccc -- CHANGELOG.md` shows an entry citing both `#938` and `#939`. |
| R17 | Gate | `npm run lint`, `npm run typecheck` and `npm run format:check` each exit 0. `npx vitest run` exits 0 with no failed files; run it alone, not beside a build. CI `gates` on the PR is green, and per the loop, CI is ground truth. |
