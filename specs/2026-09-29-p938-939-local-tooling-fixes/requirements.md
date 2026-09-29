# #938 and #939 — Local tooling fixes (requirements / acceptance criteria)

This slice closes `#938` and `#939`. `#935`'s `/validate` pass (PR #937) found both. Both are
local-tooling defects; neither affects CI, the deployed Worker or the database.
- **#938:** `tests/vendor-neutral-copy.test.ts`'s file-scanning test gets an explicit 30-second
  timeout. Its logic does not change.
- **#939:** `npm run branches:prune` moves a local branch that is checked out in a worktree from
  DELETE to REVIEW. `--apply` then no longer asks git for a delete that git refuses.

`plan.md` records the reasoning and the rejected alternatives. The prune rule it extends is
`specs/2026-09-29-p935-branch-hygiene/`.

"Before this slice" means `origin/staging` at the point the branch
`feature/938-939-local-tooling-fixes` was cut, which is `b811ccc`.

## #938 — guard-test timeout

R1. In `tests/vendor-neutral-copy.test.ts`, the test named "no shipped UI file contains a removed
vendor- or grocery-specific literal" passes `30_000` as the third argument to `it(...)`. A comment
next to it cites `#938`.

R2. The rest of `tests/vendor-neutral-copy.test.ts` is unchanged from before this slice: the
`FORBIDDEN` array, the `FILES` array, `listTsx`, `withoutComments`, the test "scans a real set of
files" (which has no timeout argument), and the body of the scanning test. No `vitest.config.*`
file sets or changes `testTimeout` or `hookTimeout`.

R3. `npx vitest run tests/vendor-neutral-copy.test.ts` exits 0 with 2 tests passed.

## #939 — worktree-safe prune

R4. `planPrune` in `scripts/branch-hygiene.ts` accepts an optional fifth parameter,
`worktrees: ReadonlyMap<string, string>`, mapping a branch name to a worktree path, with an empty
map as the default. The module still imports neither `node:child_process` nor `node:fs`.

R5. When a **local** copy would otherwise go to DELETE (not kept, merged, not the head of an open
PR) and its name is a key in `worktrees`, `planPrune` puts it in REVIEW. The reason string is
exactly `checked out in worktree <path>`, where `<path>` is the map's value for that name.

R6. The `worktrees` map changes no other classification:
- an **origin** copy whose name is in `worktrees` is classified exactly as it would be with an
  empty map;
- a local copy that is kept, unmerged, or the head of an open PR keeps its existing
  classification and its existing reason (`not merged` or `open PR #<n>`).

R7. `scripts/prune-branches.ts`'s `prune` path runs `git worktree list --porcelain` and passes
`planPrune` a map with one entry per worktree block that has a `branch refs/heads/<name>` line.
The key is `<name>` with the `refs/heads/` prefix removed. The value is the text after
`worktree ` on the same block's first line. A block with no `branch` line (detached or bare)
adds no entry.

R8. If `git worktree list --porcelain` exits non-zero, `prune` prints an error that mentions
`git worktree list`, deletes nothing, and exits 1. It does this before printing KEEP, DELETE or
REVIEW.

R9. The `count` path of `scripts/prune-branches.ts` does not run `git worktree list`, and it
still always exits 0.

R10. `tests/branch-hygiene.test.ts` has a test in which one merged branch that is not kept has
both a local and an origin copy, and its name is in `worktrees`. The test asserts all of these:
- the local copy is in REVIEW, with the exact reason `checked out in worktree <path>`;
- the origin copy is in DELETE;
- calling `planPrune` with the same inputs and no fifth argument puts both copies in DELETE.

R11. `tests/prune-branches.integration.test.ts` has a test that runs after every existing test in
the file. In the throwaway repository, it does these steps:
1. creates a branch `wt-held` with a committer date of `2026-09-06`, merges it into `staging`,
   and pushes both. That date makes it older than the kept `new-1`/`new-2` and newer than
   `pr-head`, so `--keep 2` does not keep it;
2. checks `wt-held` out in a second worktree under the test's temp directory;
3. asserts that `git branch -D <that branch>` run in the main work tree throws;
4. runs `prune --apply --keep 2`. The run exits 0, which means `execFileSync` does not throw.

It then asserts:
- the output lists that branch's local copy under REVIEW with `checked out in worktree`;
- the local branch still exists;
- the branch no longer exists in the bare origin.

The existing tests' fixtures and expectations are unchanged, including "count" expecting
`local 6, origin 6`.

R12. `.claude/commands/prune-branches.md` names the REVIEW reason `checked out in worktree`. It
tells the reader to remove the worktree (`git worktree remove <path>`, or `git worktree prune` when
the folder no longer exists) and then re-run the dry run, rather than delete the branch by hand.
The header comment of `scripts/prune-branches.ts` mentions the worktree read.

R13. `npx vitest run tests/branch-hygiene.test.ts tests/prune-branches.integration.test.ts` exits
0.

R14. Against the real repository, `GH_TOKEN=$(gh auth token -u sriahead) npm run branches:prune`
(dry run) exits 0 and changes no refs. For every branch that `git worktree list --porcelain`
reports as checked out, other than the branch checked out in the current worktree, no **local**
copy appears under DELETE.

## Gates

R15. `ARTIFACT_INDEX.md` has exactly one row linking
`specs/2026-09-29-p938-939-local-tooling-fixes/plan.md`. `npm run kms:validate` and
`npm run kms:check-generated` each exit 0. `npm run kms:assemble:internal` exits 0, and so does
`npm run build` run inside `kms/site-internal`.

R16. `CHANGELOG.md` is updated on the branch with an entry citing `#938` and `#939` (Gate 4).

R17. `npm run lint`, `npm run typecheck`, `npx vitest run` and `npm run format:check` all remain
green after this slice.
