# #935 — Branch hygiene: /prune-branches and an Orient reminder (build notes)

Branch `feature/935-branch-hygiene`, cut from `origin/staging` at `70d13e9`. Spec commit `431316a`,
build commit `20684c2`. Tooling only: no database, no Worker runtime, no UI, no migration.

## What changed and why

- **`scripts/branch-hygiene.ts`** is the pure rule and does no I/O (R1–R6).
  - `planPrune(copies, openPrs, currentBranch, keep)` returns `{ keep, delete, review }`.
  - `countVerdict(local, origin, threshold)` returns `{ due }`.
  - It also exports the constants `DEFAULT_KEEP = 12`, `REMINDER_THRESHOLD = 30` and
    `PROTECTED_NAMES`.
  - The rule is kept separate from the CLI so the unit tests never touch git.
- **`scripts/prune-branches.ts`** is the CLI (R8–R13). It has two subcommands, `count` and
  `prune`.
  - It runs git in `process.cwd()`, not the repo `ROOT` that `scripts/sdd-check.ts` uses. That
    lets the integration test point it at a throwaway repo.
  - It calls git and gh through `execFileSync` with argument arrays rather than the shell
    strings `sdd-check.ts` uses, so branch names are never parsed by a shell on Windows.
- **Tests** (R7, R14)
  - `tests/branch-hygiene.test.ts`: 8 tests, (a)–(g) plus one checking that every copy appears in
    exactly one list.
  - `tests/prune-branches.integration.test.ts`: 4 tests. It builds a bare origin and a work clone
    in `os.tmpdir()`, runs the real CLI through `node_modules/tsx/dist/cli.mjs`, and removes the
    temp directory afterwards.
- **Skill and Orient** (R15–R17)
  - New `.claude/commands/prune-branches.md`.
  - New step 10 in `.claude/commands/orient.md`; the old step 10 is now 11.
  - A matching bullet at the end of `specs/sdd-workflow.md`'s `## Orient` bullet list; the file
    goes from 2.36.0 to 2.37.0.
  - `CLAUDE.md`'s Commands line lists both scripts.
- **Regenerated files:** `ARTIFACT_INDEX.md` and `app/(admin)/staff/runbook/docs.ts`, via
  `kms:build-index`.

## Decisions taken during the build

- **Merged is worked out with one command per base.** It runs
  `git for-each-ref --merged=<base>` once for `origin/staging` and once for `origin/main`, instead
  of `git merge-base --is-ancestor` for each ref.
  - Both test the same thing: the tip is an ancestor of the base. The single command answers for
    ~475 refs in one call.
  - If a base ref is missing, it is skipped. The copies then count as not merged and go to REVIEW,
    which is the safe side.
- **Deletion order:** origin first, in batches of 50 with `git push origin --delete`, then one
  `git branch -D` for all local copies.
  - `-D` rather than `-d`, because `-d` checks merged status against HEAD and the upstream. That
    is not the spec's definition. The plan has already proven each copy merged into
    origin/staging or origin/main.
- **The current branch** is read with `git symbolic-ref --short -q HEAD`. When HEAD is detached
  the command fails, which gives `null`, so no branch is protected as current.
- **When the `count` subcommand itself throws** (for example, when not run inside a git repo), it
  prints `Branch count unavailable: …` and still exits 0. R13 says it "always exits 0", and
  `/orient` must never fail on a reminder.
- **Parsing `--keep`:** it must match `/^[1-9]\d*$/`. `0`, `abc` and a missing value are
  rejected, which exits 1. Only the `--keep N` form is supported; `--keep=N` is not.
- **The `ACTION:` line text** is
  `ACTION: branch count is 30 or more — run /prune-branches to clean up.`

## Deviations from the spec

None.

## Known-shaky areas

- **Pruning will not get the counts under 30 on its own.** A live dry run on 2026-09-29 against
  this repo showed KEEP 29, DELETE 406 and REVIEW 40, with 230 local and 245 origin branches.
  - After a real `--apply`, roughly 37 local and 32 origin branches would remain. That is the
    15 kept names plus 22 local and 18 origin REVIEW copies (unmerged, or #722/#725).
  - `/orient` will therefore keep showing `ACTION:` until the owner decides on the REVIEW
    branches. This is what the Propose decision chose (protect unmerged branches), not a defect.
  - Candidates that look dead: `fix/auth-diag-382*`, `staging_13082026` and
    `feature/p3c-stripe-payments`.
  - R13's validation row expects `ACTION:` to be present **before** the first real prune, and
    that holds.
- **The `gh` failure path has only been exercised by the validation step.** R10's
  `GH_TOKEN=invalid` row has not been run yet, and the integration test uses the
  `BRANCH_HYGIENE_OPEN_PRS` override. Check that an invalid token makes `gh pr list` exit
  non-zero, rather than quietly falling back to the stored credential. If it falls back, the row
  proves nothing, and `gh auth logout`-style isolation would be needed. Note that `GH_TOKEN`
  normally overrides the stored credential.
- **Date output uses UTC.** REVIEW dates are printed with `toISOString().slice(0, 10)`. A commit
  made shortly after midnight BST can print as the previous day. This is cosmetic and does not
  affect ranking.
- **The integration test depends on the environment.** It needs `git` on PATH and a writable
  temp directory. It turns off `commit.gpgsign` and sets a local identity so a CI runner passes.
  Each test takes about 0.6–1.0 s because it spawns tsx; the tests run with a 60 s timeout.
- **This was never run on a real repo with `--apply`**, and must not be during Validate. The first
  real run is the owner's, after the merge to `staging`, as `plan.md` says.
