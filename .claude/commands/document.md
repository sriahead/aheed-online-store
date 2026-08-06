---
description: "Gate 4 — update CHANGELOG.md before merge, plus persistent docs and tracked follow-ups"
---

Document the current changes.

Follow the **Document** stage of `specs/sdd-workflow.md` (read it if not already in context):

1. Add a `[Unreleased]` entry to `CHANGELOG.md`, in the terse style of existing entries (what
   shipped, why, what's deliberately deferred). Do this **as part of the same commit/PR as the
   change**, before opening the PR — not as an afterthought push. Gate 4's CI check only verifies
   a diff exists against the PR's *current* base branch; if another PR merges first and moves that
   base, your diff can disappear and the check fails on reopen.
2. Update the relevant persistent doc (`specs/architecture.md`, `tech-stack.md`,
   `design-system.md`, `roadmap.md`, ...) if this slice changed a standing decision, not just the
   dated slice spec.
3. Anything deliberately deferred or left incomplete becomes a tracked GitHub issue — don't let it
   disappear into a comment or your own memory.
4. If this closes out a roadmap phase/milestone, add the closure note to `specs/roadmap.md`'s
   change log, matching the existing entries' style.
5. Later phases (P7 compliance, P8 handover) need compliance reports / a handover pack per their
   own specs — call that out explicitly in that phase's `requirements.md` rather than assuming
   this step already covers it by default.
