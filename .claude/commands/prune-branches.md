---
description: Prune old git branches — keep the 12 newest plus main/staging/current; delete only merged branches with no open PR
---

Prune old branches (local and origin) for: $ARGUMENTS

The rule lives in `scripts/branch-hygiene.ts` (#935). The newest 12 branch names are kept, and
so are `main`, `staging` and the checked-out branch. Any other copy is deleted **only** if it is
merged into `origin/staging` or `origin/main` **and** is not the head of an open PR. Everything
else lands in REVIEW. `/orient` reminds you to run this once either count reaches 30.

In the Bash tool, `gh` needs the account prefix, and the script calls `gh pr list`:
`GH_TOKEN=$(gh auth token -u sriahead) npm run branches:prune`. In PowerShell the profile wrapper
sets it.

1. **Dry run.** Run `npm run branches:prune`, adding `-- --keep <N>` if the user named a
   different number. It deletes nothing. Show the user the **DELETE** and **REVIEW** sections
   with their counts. For a long DELETE list, a count and a sample is enough. Show REVIEW in
   full, because those are the branches that need a decision. If the command exits non-zero, for
   example because `gh` failed or the fetch failed, stop and report it. Do not delete anything by
   hand as a workaround.
2. **Get an explicit yes** before running `npm run branches:prune -- --apply`, with the same
   `--keep`. Approval of an earlier run does not carry over, because the list changes as branches
   merge. If the user declines, stop.
3. **Never delete a REVIEW entry** unless the user names that specific branch. When they do, delete
   only the named copy: `git push origin --delete <name>` for origin, `git branch -D <name>` for
   local. An `open PR` entry is still in use. Say so before deleting it, because deleting a PR's
   head branch closes the PR.
4. **Report the counts after deletion.** Report the `Branches now: local <n>, origin <m>` line
   from `--apply`, or the output of `npm run branches:count`, and any deletion that failed.
