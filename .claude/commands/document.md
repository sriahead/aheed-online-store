---
description: "Final durable documentation for the shipped, validated artifact — KMS index, roadmap, doc reconciliation"
---

Write the durable documentation for the artifact that just shipped.

Follow the **Document (final)** stage of `specs/sdd-workflow.md` (read it if not already in
context). This runs **after** `/ship`, on the **same Sonnet 5 session** — no model switch to start
it. It supersedes `build-notes.md` where they disagree — the notes describe intent at build time,
this describes verified reality.

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
   phase/milestone, matching existing entries' style. **This is what `npm run sdd:audit` checks at
   the next Orient**; run it here and confirm it exits 0 rather than leaving the next loop to open
   with a reported gap. Three slices (P3a/P3b/P3c) shipped without this entry before the check
   existed.
4. **Reconcile the delivery board** (status layer only, never scope): every issue for this slice
   should be **In Review** if it merged to `staging`, or closed/**Done** if promoted to `main`, and
   anything newly deferred should be on the board with a **Phase**.
5. Anything still deferred or incomplete is a tracked GitHub issue — never a comment or a memory.
6. Record anything the loop itself taught (a trap worth encoding in `specs/sdd-workflow.md` or
   `CLAUDE.md`) while it's still cheap to write down.
7. Later phases (P7 compliance, P8 handover) need compliance reports / a handover pack per their own
   specs — call that out explicitly in that phase's `requirements.md` rather than assuming this
   stage covers it by default.
8. **If this slice closed out a milestone, the loop is not finished here.** Run `/discover`, then
   `/learn`, before the model switch and `/clear` — see **Milestone close** in
   `specs/sdd-workflow.md`. The roadmap closure row you just wrote records *what* closed; those two
   phases are what turn the milestone into durable knowledge (`docs/research/discovery-log.md` and
   `docs/research/milestone-retrospectives.md`) instead of context that dies at the next `/clear`.
   Neither produces implementation scope — findings reach the roadmap through `/propose`.

**Carry-forward rule:** doc changes made after the slice's PR merged land on the **next** slice's
branch, not a PR of their own. Gate 4 requires a CHANGELOG diff on every branch, so a doc-only PR
needs its own CHANGELOG entry to be pushable at all — worth it for a real correction, wasteful for
an index footer.

When done, tell the user to **switch to Opus 5** (`/model claude-opus-5`) and *then* `/clear` and
return to `/orient` — you cannot switch model or clear context yourself. The switch belongs here,
not right after `/ship`: this stage's reconciliation work needs the context this session already
has, not Opus's extra reasoning, so switching earlier would just spend orientation tokens on a
model that then sits idle through this stage.
