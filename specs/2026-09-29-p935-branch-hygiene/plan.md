---
id: p935-branch-hygiene-plan
title: "#935 — Branch hygiene: /prune-branches and an Orient reminder (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-09-29
visibility: internal
summary: A reusable /prune-branches command keeps the 12 newest branches plus main, staging and the current branch, and deletes older branches, local and on origin, only when they are merged and have no open PR. /orient warns when either branch count reaches 30.
tags: [sdd, tooling, git, branches, orient]
related: [sdd-workflow]
---

# #935 — Branch hygiene: /prune-branches and an Orient reminder (plan)

Each SDD loop leaves behind a `feature/*` branch and a `docs/*` branch, and nothing ever removed
them. On 2026-09-29 the repo had **229 local and 245 origin branches**. 19 origin branches were not
merged into `origin/staging`, and two of those were the heads of open PRs (#725, #722). With a
list that long, the few branches that still matter are hard to spot.

**Goal:** make the cleanup a single repeatable command that cannot lose unmerged work, and have
`/orient` say when it is due again. The threshold is 30 branches.

**Decisions made by the user at Propose (2026-09-29):**
- Unmerged branches, and branches that are the head of an open PR, are **never deleted
  automatically**. The command lists them for the user to decide.
- The cleanup covers **local branches and origin branches**.

**Scope (this slice):**
- `scripts/branch-hygiene.ts` is a pure module with no I/O.
  - It decides, for each branch copy, whether to keep it, delete it or list it for review.
  - It also decides whether a branch count should trigger the reminder.
  - It is unit-tested.
- `scripts/prune-branches.ts` is the CLI. It has two subcommands.
  - `count` backs `npm run branches:count`. It is read-only apart from a `git fetch --prune`.
  - `prune` backs `npm run branches:prune`.
    - It is a dry run by default.
    - `--apply` deletes the DELETE list.
    - `--keep N` changes the number kept (default 12).
    - It reads git refs and asks `gh` for the open PRs.
- `.claude/commands/prune-branches.md` is the reusable skill. It runs the dry run and shows the
  result. It gets an explicit yes before it runs `--apply`, and never deletes a REVIEW entry on
  its own.
- `/orient` gains a step that runs `npm run branches:count`. The same step is mirrored in the
  Orient section of `specs/sdd-workflow.md`, because that doc governs the command files.
- `CLAUDE.md`'s Commands line lists the two new scripts.

**How the plan is computed (the reasoning behind R3–R7):**
- **Candidates**
  - A candidate is every branch **name** found under `refs/heads/*` or
    `refs/remotes/origin/*`, after `git fetch --prune origin`.
  - `main`, `staging` and `origin/HEAD` are never candidates.
- **Ranking**
  - A name's date is the newest committer date of its local and origin copies.
  - The 12 newest names are kept. Ties are broken by name, so the result is deterministic.
  - "Newest 12" is counted per name, not per copy. That way a feature branch and its origin copy
    are kept or dropped together.
- **Always protected:** `main`, `staging`, and the currently checked-out branch together with its
  origin copy. These are extra to the 12.
- **Verdict for each copy that is not kept.** Each copy is judged on its own, because a local copy
  can hold commits its origin copy does not.
  - A copy is **DELETE** only when both of these hold:
    - its tip is an ancestor of `origin/staging` or `origin/main`;
    - its name is not the head of an open PR.
  - Anything else is **REVIEW**. REVIEW has two possible reasons: `open PR #N`, or `not merged`.
- **Why "merged" means ancestry.** This repo merges PRs with merge commits (`Merge pull request
  #NN`), so ancestry is a real test. If a branch was squash-merged, its tip is not an ancestor
  either. It shows up as REVIEW, which is safe.
- **What happens when a lookup fails.**
  - If `gh` cannot list open PRs, the CLI exits non-zero and deletes nothing. Without that list it
    cannot prove that a merged branch has no open PR.
  - If `git fetch` fails, `prune` stops. `count` carries on with the refs it already has and says
    it is offline. It is only a reminder, so that is enough.

**Deliberately excluded:**
- GitHub's "Automatically delete head branches" repository setting. It would stop most of the
  build-up at the source, but it is a repository-level decision with its own trade-offs.
  Tracked separately if the user wants it.
- Changes to rulesets or protection for `main`/`staging`.
- Pruning remotes other than `origin`, and tags.
- An automatic or scheduled prune. Deleting branches stays a user-approved action.
- The **first real cleanup run**. It happens after this slice merges to `staging` and is not a
  Validate step, because Validate must not delete the user's branches. The Ship stage hands the
  dry-run output to the user, and the `--apply` run is theirs to approve.

**Open items carried forward:** the first `--apply` run, as above. Issue #935 records its outcome
in a comment.
