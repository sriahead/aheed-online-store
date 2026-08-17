---
description: Branch, PR, wait for real CI, and promote staging -> main deliberately
---

Ship the current validated + documented change.

Follow the **Ship** stage of `specs/sdd-workflow.md` (read it if not already in context):

1. Branch off a freshly **fetched** base (`git fetch origin staging`, then branch from
   `origin/staging`) — not a stale local branch that might be behind or already merged/stale.
2. Push everything for this logical unit as a complete commit (or set of commits) *before* opening
   the PR. Don't iterate live against CI on an already-open PR — merges have landed within seconds
   of opening before, stranding a fast-follow commit outside the merge.
3. Open the PR referencing its issue (`Closes #NN`), matching this repo's existing PR title/body
   conventions.
4. Wait for the **actual** CI result before calling it ready. Poll correctly:
   `until ! gh pr checks <N> | grep -q "pending"; do sleep 5; done` — a naive string-equality check
   against multi-line `gh pr checks` output breaks and reports false failures.
5. Merging is hard-to-reverse and visible to others: **always get explicit user confirmation
   before merging**, even right after a related approval — one merge is not blanket permission for
   the next one.
6. `staging → main` is its own deliberate promotion PR (title convention: "Promote X to
   production"), opened only once staging's own PR is merged and its CI is green. It gets the same
   explicit-confirmation treatment before merging, since merging to `main` triggers a real
   production deploy. **If it closes more than one issue, repeat the keyword per issue**
   (`closes #93, closes #96`, not `Closes #93, #96`) — GitHub only honours the first in a
   comma-separated list, and the rest stay open on merge with no warning (#112).
7. After merging, confirm the relevant deploy workflow (`deploy-staging`/`deploy-production`)
   actually completed — don't assume success from the merge alone.
8. If a PR merges before a fix/follow-up commit lands, don't force-push or rewrite history to
   patch it in — open a tracking issue and land the fix as its own proper follow-up PR (`/propose`
   → `/spec` if non-trivial, otherwise straight to a small `/build` + `/ship`).
9. Once merged to `staging` and the deploy is confirmed, move the issue to **In Review** on the
   delivery board — **not `Done`**. `Done` means *in production*: PRs merge into `staging`, which
   isn't the default branch, so `Closes #NN` doesn't fire and the issue stays open by design. It
   closes (→ `Done`) only when the work is promoted to `main`.
10. Then go straight to `/document` — **no model switch here.** `/document` runs on this same
    Sonnet 5 session; the switch to Opus 5 happens at the end of *that* stage, immediately before
    `/clear`, not now.

Ship only what `/validate` actually passed. If validation was skipped, ran in the same context that
built the artifact, or left rows unverified, say so before opening the PR rather than after.
