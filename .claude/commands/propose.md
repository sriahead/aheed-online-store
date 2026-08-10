---
description: "Gate 1 — propose before work, calibrated to the size of the decision"
---

Propose the approach for: $ARGUMENTS

Follow the **Propose** stage of `specs/sdd-workflow.md` (read it if not already in context):

1. Judge the size of the decision first:
   - **Routine, single-approach work** (obvious fix, one clear way to do it): state the plan in
     1-2 sentences and proceed — don't open a planning session for this.
   - **Real forks** (architecture choice, missing input, more than one defensible approach): use
     `EnterPlanMode` and/or `AskUserQuestion`. Name the alternative(s), say why you're not picking
     them, and ask when the answer is genuinely the user's call rather than guessing.
2. Open a GitHub issue before writing the spec, for anything beyond a trivial fix — it's what the
   eventual PR's `Closes #NN` and the CHANGELOG entry both anchor to. Then **add it to the delivery
   board**: `gh project item-add 2 --owner sriahead --url <issue-url>`, set its **Phase**, leave
   Status at **Backlog**. Ten issues were filed after the board was provisioned and none reached it
   until a sync caught them — an issue that isn't on the board is invisible to every later stage.
3. Wait for explicit approval on non-trivial work before moving to `/spec`. An approval already
   given for a different decision does not carry forward to this one.

Do not write `requirements.md` or implementation code yet — that's `/spec` and `/build`.
