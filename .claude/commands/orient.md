---
description: Ground in the actual repo state before proposing or building anything
---

Before doing anything else this session on: $ARGUMENTS

Follow the **Orient** stage of `specs/sdd-workflow.md` (read it if not already in context):

1. Read the actual code/config for the area involved — not just the doc that describes it.
   Planning docs like `docs/repo-structure.md` have gone stale before (phase-tags contradicted by
   what's actually in the repo); `specs/roadmap.md` and the filesystem are authoritative.
2. If this touches a roadmap item, confirm it's *actually* buildable now — check for the
   prerequisite code/data it depends on, don't assume "next on the roadmap" means "ready."
3. `git fetch` and check how far `origin/staging`/`origin/main` have actually diverged
   (`git log origin/main..origin/staging --oneline`) before assuming either is in a known state.
4. Coming out of a Clear, this is also the **re-entry point** — the previous loop's spec, build
   notes and final documentation are on disk. Read them rather than assuming continuity with a
   conversation that no longer exists.
5. **Run `npm run sdd:audit`.** It reports whether slices shipped under this loop got their roadmap
   change-log entry and reached `ARTIFACT_INDEX.md`. This is the only check that runs *after* Ship,
   so a gap is real work, not a warning — fix it on the current branch (post-merge doc changes ride
   the next slice's branch) rather than noting it and moving on.
6. Check the delivery board for the status layer
   (`gh project item-list 2 --owner sriahead --format json`). Scope comes from `specs/` and the
   filesystem, never the board — if they disagree, the board needs reconciling.
7. Report a short grounding summary: what you found to be true vs. what the docs/roadmap assumed,
   and any discrepancy worth flagging before moving to `/propose`.

Do not start implementing. This is a read-only grounding pass.
