---
description: "Final durable documentation for the shipped, validated artifact — KMS index, roadmap, doc reconciliation"
---

Write the durable documentation for the artifact that just shipped.

Follow the **Document (final)** stage of `specs/sdd-workflow.md` (read it if not already in
context). This runs **after** `/ship`, on Opus 5. It supersedes `build-notes.md` where they
disagree — the notes describe intent at build time, this describes verified reality.

**Gate 4 is not here.** The `CHANGELOG.md` entry belongs to `/build-notes`, because it must be on
the branch before it merges. If you reach this stage and the CHANGELOG entry is missing, the branch
should never have merged — say so.

1. Rebuild the KMS index (`npm run kms:build-index`) and re-validate front-matter
   (`npm run kms:validate`). The index footer records the commit it was built from, so a post-ship
   rebuild always trails the slice it documents by one commit — expected, not a bug.
2. **Reconcile the docs with what validation actually found.** Live verification routinely surfaces
   things no pre-ship writing would have predicted; those become doc corrections and tracked issues
   here, not silent knowledge.
3. Update `specs/roadmap.md` — progress, plus a closure note in its change log if this closed out a
   phase/milestone, matching existing entries' style.
4. Anything still deferred or incomplete is a tracked GitHub issue — never a comment or a memory.
5. Record anything the loop itself taught (a trap worth encoding in `specs/sdd-workflow.md` or
   `CLAUDE.md`) while it's still cheap to write down.
6. Later phases (P7 compliance, P8 handover) need compliance reports / a handover pack per their own
   specs — call that out explicitly in that phase's `requirements.md` rather than assuming this
   stage covers it by default.

**Carry-forward rule:** doc changes made after the slice's PR merged land on the **next** slice's
branch, not a PR of their own. Gate 4 requires a CHANGELOG diff on every branch, so a doc-only PR
needs its own CHANGELOG entry to be pushable at all — worth it for a real correction, wasteful for
an index footer.

When done, tell the user it's safe to `/clear` and return to `/orient` — you cannot clear context
yourself.
