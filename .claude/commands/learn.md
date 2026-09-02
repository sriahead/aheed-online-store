---
description: "Retrospective pass on a completed milestone — what shipped, what held, what surprised us, which lessons get promoted"
---

Run a Learn pass on: $ARGUMENTS

(No argument means the milestone that just closed.)

Follow the **Learn** stage of `specs/sdd-workflow.md` (read it if not already in context). Run this
**after** `/discover`, so the retrospective can react to what discovery surfaced.

1. **Reconstruct what actually shipped from evidence, not memory:** the milestone's issues
   (`gh issue list --milestone "<name>" --state all`), its roadmap change-log rows, the `CHANGELOG.md`
   entries, and the merged PRs. Coming out of a `/clear`, the conversation that built it no longer
   exists — read the disk.
2. **Compare delivered against promised.** Name anything descoped, and say whether it was re-homed
   to a later phase or dropped outright. A silently dropped item is the thing a retrospective exists
   to catch.
3. **Test the assumptions.** For each one the milestone rested on, record: held / disproved / still
   untested, with evidence. **"Still untested" is a legitimate and expected answer** — write it
   rather than manufacturing a verdict.
4. **Collect what emerged that nobody planned for** — defects, traps and surprises from Build,
   Validate and Ship. For each: what it was, what found it, and **what would have found it earlier**.
   That last part is where the value is.
5. **Answer the open hypotheses.** For anything that entered this milestone from
   `docs/research/discovery-log.md`, return to it and say whether the predicted behaviour actually
   changed. Recommend iteration, rollback or abandonment. Do not defend a shipped idea against its
   own evidence.
6. **Measurement, honestly.** State what the milestone was supposed to move and whether it can be
   observed yet. If there is no instrumentation, **say so plainly** — never substitute an estimate
   for a measurement.
7. **Promote the durable lessons, and name where each one went.** `CLAUDE.md` for anything that
   should change every future session; `specs/sdd-workflow.md` for process; a test or a CI check for
   anything mechanically enforceable; an ADR for a decision. **A lesson recorded only in the
   retrospective has not been promoted** — this repo has paid for rulings that lived where nobody
   reads them.
8. **Append the entry to `docs/research/milestone-retrospectives.md`** using that file's template,
   newest first, and bump its front-matter `version` and `updated`.
9. File issues for the follow-on work. Nothing here becomes implementation scope without `/propose`.

Then run `npm run kms:validate` and `npm run kms:build-index`, since both research files are KMS
artifacts. Watch the MDX traps: no bare `<` before a digit, no unbackticked curly braces in prose.
