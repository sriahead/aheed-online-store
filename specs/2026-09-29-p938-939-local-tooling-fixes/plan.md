---
id: p938-939-local-tooling-fixes-plan
title: "#938 and #939 — Local tooling fixes: guard-test timeout and worktree-safe branch prune (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-09-29
visibility: internal
summary: The vendor-neutral-copy guard test gets an explicit 30-second timeout so a loaded local run stops failing it, and the branch prune moves a local branch checked out in a worktree to REVIEW instead of letting git reject the whole local delete.
tags: [sdd, tooling, git, branches, tests]
related: [p935-branch-hygiene-plan, sdd-workflow]
---

# #938 and #939 — Local tooling fixes: guard-test timeout and worktree-safe branch prune (plan)

`#935`'s `/validate` pass (PR #937, 2026-09-29) found two local-tooling defects and filed them as
issues. Neither affects CI, the Worker, the database or any user. The owner named both for a single
slice at Propose, and Gate 1 was approved on 2026-09-29.

**Goal:** a full local `npx vitest run` no longer fails `tests/vendor-neutral-copy.test.ts` because
the machine is loaded. `npm run branches:prune -- --apply` no longer fails its local delete step
because a branch is checked out in a worktree.

## #938 — the vendor-neutral-copy guard test times out under load

`tests/vendor-neutral-copy.test.ts` (`#729`, widened by `#905`) has two tests. The second, "no
shipped UI file contains a removed vendor- or grocery-specific literal", parses every
`app/**/*.tsx` and `components/**/*.tsx` file plus five `lib/` modules with the TypeScript
compiler, prints each without comments, and searches the result for a denylist of strings. The
repo's `vitest.config` sets no `testTimeout`, so Vitest's default of 5 seconds applies. At `#935`'s
Validate that test took about 6.5 seconds in both full-suite runs on the Windows checkout and failed.
Run alone, it took 1.3 seconds and passed. CI passed it.

**Chosen fix:** give that one test an explicit timeout of `30_000` ms, as the third argument to its
`it(...)`, with a one-line comment citing `#938`. `tests/repository-transaction-safety.test.ts:222`
already uses a 30-second per-test timeout, and `tests/prune-branches.integration.test.ts` uses
60-second ones. Nothing else in the file changes: not `FORBIDDEN`, not `FILES`, not
`withoutComments`, and not the first test.

**Rejected at Propose:**
- *Caching the parsed source between the two assertions*, which the issue suggests. Only the second
  test parses anything, and it parses each file once, so a cache would save nothing.
- *Pre-filtering on raw text and parsing only files whose raw text contains a denylisted string.*
  This would be much faster, but the TypeScript printer re-emits code, and nobody has proved that
  raw text and printed text always agree on these strings. The pre-filter could let the test miss a
  string without failing, which is the wrong trade for a guard test when the overrun is 1.5 seconds.
- *Raising the timeout suite-wide in `vitest.config`.* That would hide a genuinely slow or hung test
  anywhere else in the suite.

## #939 — the prune's `--apply` fails when a branch is checked out in a worktree

`scripts/prune-branches.ts` (`#935`) deletes every local copy on the DELETE list with one
`git branch -D a b c …`. Git refuses to delete a branch that is checked out in any worktree. Then
the whole local step reports as one failure, the command exits 1, and the output does not say which
branch caused it. This repo creates worktrees under `.claude/worktrees/` (the Agent tool's
`isolation: "worktree"`), so it can happen for real. The only guard in the planner today is the
branch checked out in the *current* worktree, which is always KEPT.

**Chosen fix:** handle it at planning time.
- `scripts/prune-branches.ts` reads `git worktree list --porcelain` and builds a map from branch
  name to worktree path. It takes every `branch refs/heads/<name>` line and pairs it with the
  `worktree <path>` line of the same block. A detached-HEAD or bare block has no `branch` line and
  contributes nothing. The map includes the current worktree's branch. That is harmless, because
  `planPrune` already KEEPs the current branch before it looks at anything else.
- `planPrune` in `scripts/branch-hygiene.ts` gets an optional fifth parameter,
  `worktrees: ReadonlyMap<string, string>`, which defaults to an empty map. That way every existing
  caller and test is unchanged. The module stays pure (no `node:child_process`, no `node:fs`).
- The new rule changes one outcome. A **local** copy that would otherwise be DELETED, and whose name
  is in `worktrees`, goes to REVIEW with the reason `checked out in worktree <path>`. `<path>` is
  printed exactly as git gave it. Every other outcome is as before:
  - an **origin** copy of that name is still judged by the normal rule, so it is deleted if it is
    merged and not the head of an open PR, because deleting an origin ref never touches a worktree;
  - a copy that is KEPT, unmerged, or the head of an open PR keeps its existing classification and
    reason (`not merged` / `open PR #<n>`).
- If `git worktree list --porcelain` fails, `prune` prints an error and exits 1 before it prints any
  plan, and deletes nothing. `fetchPrune` failing already behaves this way. Planning without the
  list could lead straight back to the failure this slice fixes.
- `count` does not read worktrees. It stays a read-only reminder that always exits 0.
- `.claude/commands/prune-branches.md` gains one sentence naming the new REVIEW reason. It also says
  what to do about it: remove the worktree (`git worktree remove <path>`, or `git worktree prune`
  if the folder is already gone), then re-run the dry run.

**Rejected at Propose:** deleting local branches one at a time and reporting failures per branch.
That would still attempt a delete git is certain to refuse. The dry run would still not show it
coming. And a branch checked out in a worktree is plausibly work in progress, which is a human
decision, not an automatic delete.

**Tests:**
- A unit case in `tests/branch-hygiene.test.ts` covers the new branch of the rule, including that
  the origin copy is still deleted.
- A real-git case in `tests/prune-branches.integration.test.ts` checks out a merged branch in a
  second worktree. It first proves the premise: `git branch -D` of that branch fails. Then it proves
  that `--apply` exits 0, keeps the local copy, and deletes the origin copy.

## Deliberately excluded

- **Changing the prune rule in any other way:** `--keep`, the protected names, the merged test, or
  the open-PR test. Also out: squash-merge detection, which is why today's dry run shows DELETE 0
  and REVIEW 40. That is a separate question and would need its own `/propose`.
- **#936** (GitHub's "Automatically delete head branches" setting) is an owner decision. This slice
  does not touch it.
- **Deleting, removing or pruning any worktree.** The command reports the worktree and leaves it
  alone.
- **Running `--apply` against the real repository.** As in `#935`, `--apply` runs only against the
  integration test's throwaway repository.
- **Any other slow test**, and any change to `vitest.config` or the pool settings. CLAUDE.md's "run
  `npx vitest run` alone" rule stays as it is.
- **No schema, runtime, UI, or deployed-code change**, and no migration.

## Open items carried forward

None. Both issues close with this slice.
