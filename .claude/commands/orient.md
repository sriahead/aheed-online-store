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
4. Report a short grounding summary: what you found to be true vs. what the docs/roadmap assumed,
   and any discrepancy worth flagging before moving to `/propose`.

Do not start implementing. This is a read-only grounding pass.
