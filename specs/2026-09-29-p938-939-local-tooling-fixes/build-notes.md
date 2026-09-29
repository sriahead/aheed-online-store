# #938 and #939 — Local tooling fixes (build notes)

Written at the end of Build, before the Clear. Spec commit `7840067`, build commit `f5312b6`, on
`feature/938-939-local-tooling-fixes`. The branch was cut from `origin/staging` at `b811ccc`. That
is the base `validation.md` diffs against.

## What changed and why

- **`tests/vendor-neutral-copy.test.ts` (#938):** the file-scanning test now ends `}, 30_000);`. A
  two-line comment citing `#938` sits just above that line, inside the test body. That is the whole
  change to this file: `FORBIDDEN`, `FILES`, `listTsx`, `withoutComments` and the first test are
  byte-for-byte as before (R1, R2).
- **`scripts/branch-hygiene.ts` (#939):** `planPrune` gains a fifth parameter,
  `worktrees: ReadonlyMap<string, string> = new Map()`. The worktree check sits **inside** the
  existing `copy.merged && pr === undefined` branch. So it can only divert a copy that would
  otherwise have been deleted, and only a `local` one. Every kept, unmerged or open-PR copy goes
  through the untouched code, with its reason unchanged. The module doc comment gains one paragraph
  on the new rule. The module still imports nothing from node.
- **`scripts/prune-branches.ts` (#939):**
  - A new `worktreeBranches()` parses `git worktree list --porcelain` into a map from branch name
    to worktree path. It splits lines on `/\r?\n/`, takes the path from each block's `worktree`
    line, and pairs it with the name from that block's `branch refs/heads/` line.
  - It calls `run`, which throws. So `prune` wraps it in try/catch and, on failure, prints an error
    naming `` `git worktree list --porcelain` ``, then returns 1.
  - The call sits after the `gh` open-PR check and before `mergedRefnames()`, so no plan is printed
    on failure (R8).
  - The header comment mentions the worktree read. `count` is untouched.
- **`tests/branch-hygiene.test.ts`:** a new case **(h)** is inserted before "places every input
  copy in exactly one list". It checks three things (R10): the local copy goes to REVIEW with the
  exact reason, the origin copy goes to DELETE, and calling again with no fifth argument deletes
  both. Cases (a)–(g) are unchanged. The diff adds lines only.
- **`tests/prune-branches.integration.test.ts`:** a new **last** `it`. It does four things in order:
  - creates `wt-held` (09-06, merged into staging, pushed), checks `main` back out and fetches;
  - runs `git worktree add` into `<base>/wt-held`;
  - asserts `git branch -D wt-held` throws;
  - runs `cli(["prune", "--apply", "--keep", "2"])`.

  It then asserts the REVIEW line, that local `wt-held` still exists, and that `wt-held` is gone
  from the bare origin. The fixture comment at the top gains one line for `wt-held`. The existing
  tests and their expectations are unchanged, including "count" = `local 6, origin 6`, which still
  runs before `wt-held` exists.
- **`.claude/commands/prune-branches.md`:** step 3 gains the `checked out in worktree <path>`
  reason, with what to do about it: ask whether the worktree is finished, run
  `git worktree remove <path>` (or `git worktree prune` if the folder is gone), then re-run the dry
  run. It says never to force the delete by hand.

## Decisions taken during the build

- **Where the worktree check sits:** inside the would-delete branch, not as a separate step ahead
  of the merged/PR checks. That guarantees R6 structurally, with no need for extra tests. An
  unmerged local copy that is also checked out in a worktree keeps the reason `not merged`, because
  that is the stronger fact for the human deciding.
- **Order of the worktree read in `prune`:** after the `gh` check, before the merge-ref read. Both
  are refusal points that exit 1 with nothing deleted, so their relative order has no behavioural
  effect.
- **The map includes the current worktree's branch.** That is harmless, because `planPrune` keeps
  the current branch before the check is ever reached (plan.md says so). Filtering it out would have
  meant a second git call to find the current worktree's path, for no gain.
- **The integration test asserts the REVIEW line with a regex that stops at
  `checked out in worktree `.** It does not check the path, because git prints a Windows temp path
  whose form (drive letter, slashes, 8.3 short names) varies by machine. The unit test (h) asserts
  the full string, path included.
- **The CHANGELOG entry goes under `### Fixed`** in `[Unreleased]`. Both issues are defects in
  existing tooling.

## Deviations from the spec

None.

## Known-shaky areas

- **The red proof (validation.md R11) has not been run.** I ran the three affected test files green
  (16 tests), ESLint on the touched files, `typecheck`, Prettier, and one real-repo dry run. I did
  not revert `scripts/` to `b811ccc` to watch the new integration test fail. Validate owns that,
  and it is the only evidence that the test would catch the original defect. The premise assertion
  inside the test (`git branch -D` throws) passed on git 2.45.2.windows.1.
- **Porcelain parsing has been exercised on this machine's git only** (2.45.2.windows.1), and only
  on plain paths. A worktree path containing a newline would break the line parser. Git quotes such
  paths only with `-z`, which this slice does not use. That is an accepted edge case, not a tested
  one.
- **The real repo has no second worktree**, so R14's live check can only show that nothing
  regressed: DELETE 0 / REVIEW 40, the same as before the slice, with KEEP 29 now that this
  feature branch exists. R11 is the behavioural proof.
- **The full `npx vitest run` has not been run in this context.** Under load, #938's own test is
  the one that used to fail. The 30-second budget comes from a measurement of about 6.5 seconds,
  not from a proven worst case. Run the full suite alone, per CLAUDE.md.
- **Out of scope but adjacent:** the dry run's DELETE 0 comes from squash-merged branches reading
  as `not merged`. That is already tracked as `#942`, filed before this slice. No new issue was
  needed, and this slice does not touch it.
- **The KMS site build has not been run yet** (R15). This stage runs `kms:build-index` and
  `kms:check-generated`. `kms:assemble:internal` and `npm run build` in `kms/site-internal` are
  listed for Validate.
