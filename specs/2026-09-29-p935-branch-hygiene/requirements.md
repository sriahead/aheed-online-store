# #935 — Branch hygiene: /prune-branches and an Orient reminder (requirements / acceptance criteria)

This slice closes #935. It adds `npm run branches:prune`, `npm run branches:count`, a
`/prune-branches` slash command, and a reminder step in `/orient`.

The rule in one line: keep the 12 newest branch names plus `main`, `staging` and the checked-out
branch. Delete an older branch copy, local or on origin, **only** when it is merged into
`origin/staging` or `origin/main` **and** is not the head of an open PR. List everything else for
review. `plan.md` holds the reasoning.

**Terms used below**

- **Name.** A branch name found under `refs/heads/<name>` (local) or
  `refs/remotes/origin/<name>` (origin), read after `git fetch --prune origin`.
  `HEAD`, `main` and `staging` are excluded.
- **Copy.** One ref for a name: its local branch, or its origin branch.
- **Name date.** The newest committer date among a name's copies.
- **Merged.** A copy is merged when its tip commit is an ancestor of `origin/staging` or of
  `origin/main`, as tested by `git merge-base --is-ancestor`.

## Pure planner

R1. `scripts/branch-hygiene.ts` exists.
- It imports nothing from `node:child_process` or `node:fs`.
- It exports `planPrune` and `countVerdict`.

R2. `planPrune` returns a plan that sorts every copy of every name into exactly one of three
lists: KEEP, DELETE or REVIEW. It takes:
- the copies, each with name, location (`local`/`origin`), committer date and merged flag;
- the set of open-PR head names, each with its PR number;
- the current branch name;
- `keep` (a number).

R3. **Kept names.**
- Names are ranked by name date, newest first. Ties go by name in ascending code-point order.
- The first `keep` names are kept, and every copy of a kept name goes to KEEP.
- `main`, `staging` and the current branch also go to KEEP, with all of their copies.
- These protected names do **not** count towards `keep`.
- When HEAD is detached, there is no current branch to protect.

R4. **DELETE.** A copy of a name that is not kept goes to DELETE only when both hold:
- the copy is merged;
- the name is not an open-PR head.

R5. **REVIEW.** Every other copy of a name that is not kept goes to REVIEW, with a reason:
- `open PR #<number>` when the name is an open-PR head, whether or not the copy is merged;
- `not merged` otherwise.

R6. `countVerdict(localCount, originCount, threshold)` returns `due: true` exactly when
`localCount >= threshold` or `originCount >= threshold`.

R7. `tests/branch-hygiene.test.ts` exists and covers each of these cases with a named test:
- (a) exactly `keep` names are kept, newest first, with the name tie-break;
- (b) `main`, `staging` and the current branch stay in KEEP when they are older than every other
  name, and do not reduce the `keep` count;
- (c) a merged copy with no open PR goes to DELETE;
- (d) an unmerged copy goes to REVIEW with `not merged`;
- (e) a merged copy whose name is an open-PR head goes to REVIEW with `open PR #N`;
- (f) a name whose local copy is unmerged and origin copy is merged gives one REVIEW entry and
  one DELETE entry;
- (g) `countVerdict` at 29/29, 30/0 and 0/30, with a threshold of 30.

## CLI

R8. `package.json` defines both of these:
- `"branches:prune": "tsx scripts/prune-branches.ts prune"`
- `"branches:count": "tsx scripts/prune-branches.ts count"`

R9. **`npm run branches:prune` with no flags is a dry run.**
- It runs `git fetch --prune origin` and exits non-zero if that fails.
- It prints three headed sections, `KEEP (<n>)`, `DELETE (<n>)` and `REVIEW (<n>)`:
  - each entry is shown as `local <name>` or `origin/<name>`;
  - REVIEW entries also show the name date as `YYYY-MM-DD` and the reason.
- The last line starts `Dry run — nothing deleted.`
- It exits 0 and changes no refs apart from the fetch's pruning of refs that are already gone.

R10. **Open PRs.**
- The CLI gets open-PR heads from `gh pr list --state open --limit 500 --json number,headRefName`.
- If that command fails, the CLI prints an error naming `gh` and exits non-zero without deleting
  anything. This applies in dry-run and `--apply` modes.
- For tests only, the environment variable `BRANCH_HYGIENE_OPEN_PRS` replaces the `gh` call. It
  takes a JSON array of `{ "number": n, "headRefName": "..." }`.

R11. **`--apply`.** `npm run branches:prune -- --apply` works out the same plan and then:
- deletes every DELETE origin copy with `git push origin --delete` (in batches of at most 50
  names);
- deletes every DELETE local copy with `git branch -D`;
- deletes nothing in KEEP or REVIEW;
- prints the local and origin counts after deletion;
- exits non-zero if any deletion command failed.

R12. `--keep <N>` replaces the default of 12 in both modes. Any value that is not a positive
integer is rejected with a non-zero exit.

R13. **`npm run branches:count`.**
- It runs `git fetch --prune origin`. If the fetch fails, it prints a line containing `offline`
  and carries on with the refs it already has.
- It prints `Branches: local <n>, origin <m> (reminder at 30)`. The counts include `main` and
  `staging` and exclude `origin/HEAD`.
- When `countVerdict` returns due, it also prints a line starting `ACTION:` that names
  `/prune-branches`.
- It always exits 0 and never deletes anything.

R14. **Integration test.** `tests/prune-branches.integration.test.ts` does the following:
- builds a throwaway repo with a bare `origin` in a temp directory, created with `git init -b main`
  and given a repo-local `user.name`/`user.email`, so the test passes on a CI runner that has no
  global git identity;
- uses `GIT_COMMITTER_DATE` to fix the commit dates;
- sets `BRANCH_HYGIENE_OPEN_PRS`;
- runs the CLI in dry-run mode, then with `--apply --keep 2`.

It asserts that:
- the dry run changes no refs;
- `--apply` removes exactly the merged, non-PR, non-kept copies, both local and origin;
- the unmerged branch and the open-PR branch survive in both places.

## Skill and Orient reminder

R15. `.claude/commands/prune-branches.md` exists, with a `description:` front-matter line. It
instructs, in this order:
1. run `npm run branches:prune` and show the user the DELETE and REVIEW sections;
2. get an explicit yes before running `npm run branches:prune -- --apply`;
3. never delete a REVIEW entry unless the user names that branch;
4. report the counts after deletion.

It also states that in the Bash tool `gh` needs the `GH_TOKEN=$(gh auth token -u sriahead)`
prefix.

R16. `.claude/commands/orient.md` has a numbered step that:
- runs `npm run branches:count`;
- says that an `ACTION:` line is reported in the grounding summary with a `/prune-branches`
  suggestion;
- says the step warns only and blocks nothing.

`specs/sdd-workflow.md`'s `## Orient` section carries an equivalent bullet. The front-matter
`version` goes up by a minor version, and `updated` is set to `2026-09-29`.

R17. `CLAUDE.md`'s `## Commands` line includes both `branches:count` and `branches:prune`.

## Gates

R18. `ARTIFACT_INDEX.md` has exactly one row linking
`specs/2026-09-29-p935-branch-hygiene/plan.md`.
- `npm run kms:validate` exits 0.
- `npm run kms:check-generated` exits 0.

R19. `CHANGELOG.md` is updated on the branch (Gate 4).

R20. `npm run lint`, `npm run typecheck`, `npx vitest run` and `npm run format:check` all remain
green after this slice.
