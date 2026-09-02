---
id: milestone-retrospectives
title: "Milestone retrospectives"
audience: [dev, product]
type: doc
status: approved
version: "1.0.0"
updated: 2026-09-02
visibility: internal
summary: "Append-only record of Learn-phase retrospectives — what each completed milestone actually delivered, which assumptions held or failed, what emerged unexpectedly, and which lessons were promoted into CLAUDE.md or the workflow."
tags: [research, retrospective, learn, milestone, sdd]
related: [research-index, sdd-workflow, roadmap, changelog]
---

# Milestone retrospectives

Newest entry first. Written by the **Learn** phase (`/learn`, and automatically at every milestone
close, immediately after Discover).

A retrospective is **evidence-first**. Where a claim can be checked — a merged PR, a roadmap
change-log row, an issue number, a CI run id, a live query — cite it. Where it cannot, say
**"no evidence available"** rather than reaching a conclusion anyway. An honest gap is a finding;
an invented conclusion is a liability, because the next reader will treat it as fact.

## Entry template

```
## <milestone> — retrospective (YYYY-MM-DD)

**Closed by:** <PR #NN / merge SHA>   **Roadmap closure row:** <date of the row>

### What was delivered
Issue by issue, against what the milestone said it would deliver. Name anything descoped, and
whether it was re-homed to a later phase or dropped.

### Assumptions tested
| Assumption | Where it was recorded | Outcome | Evidence |
| --- | --- | --- | --- |
Outcome is one of: held / disproved / still untested. "Still untested" is a legitimate row and
should be the honest answer whenever nothing actually exercised it.

### What emerged that nobody planned for
The defects, traps and surprises found during Build, Validate or Ship. Each one: what it was, what
found it, and what would have found it earlier.

### Repeat / avoid
Concrete practices, not sentiments. "Ran the KMS assemble build before pushing every spec edit" is
a practice; "communicate better" is not.

### Lessons promoted
Where each durable lesson went — `CLAUDE.md`, `specs/sdd-workflow.md`, a test, a CI check, an ADR.
A lesson recorded only here has not been promoted; this repo has already paid for the difference
between a ruling that lives where it gets read and one that does not.

### Measurement
What the milestone's changes were supposed to move, and whether that can be observed yet. If there
is no instrumentation, say so plainly — do not substitute an estimate.

### Follow-on
Issues filed, roadmap rows added, hypotheses handed to the Discovery log.
```

---

*No milestone has been closed under the Discover/Learn phases yet. The first entry will be written
when P9 closes.*

**P8, closed 2026-08-28, predates these phases and is deliberately not backfilled** — a
retrospective written months later from the change log alone would be reconstruction, not evidence,
which is exactly what the template above forbids. Its durable lessons were already promoted into
`CLAUDE.md` at the time they were learned.
