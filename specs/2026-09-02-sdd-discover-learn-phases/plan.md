---
id: sdd-discover-learn-phases-plan
title: "DISCOVER and LEARN — milestone-level SDD phases (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-09-02
visibility: internal
summary: "Adds two strategic phases outside the per-slice SDD loop — Discover (forward-looking research) and Learn (milestone retrospective) — with three KMS-registered homes under docs/research/ and a milestone-close sequence wired into /document."
tags: [sdd, workflow, process, research, retrospective, kms]
related: [sdd-workflow, research-index, discovery-log, milestone-retrospectives, roadmap]
---

# DISCOVER and LEARN — milestone-level SDD phases (plan)

**Goal:** give the milestone the same treatment the slice already gets. Shipping this slice means a
milestone can no longer close with its forward-looking findings and its lessons living only in a
conversation that the next `/clear` destroys.

Closes `#550`.

## Why this slice exists

The SDD loop is complete for a **slice** and absent for a **milestone**. `/document` (final) carries
one bullet asking the assistant to "record anything the loop itself taught" — scoped to the slice,
aimed at `CLAUDE.md`, and with no forward-looking counterpart at all.

The cost is visible in the repo's own history. P8 closed on 2026-08-28 with no retrospective of any
kind. `CLAUDE.md` has grown a long list of hard-won traps, every one of which reached that file
because somebody happened to remember it at the right moment rather than because a stage asked. And
this repo has already written down the more general version of the failure: a ruling that lives only
in a document nobody opens at decision time is not a ruling. Knowledge that lives only in a finished
conversation is not knowledge at all.

## Scope (this slice)

**1. `specs/sdd-workflow.md` — the two stages.** Bumped to 2.27.0. A second diagram showing the two
phases sitting outside the per-slice loop, full `## Discover` and `## Learn` stages, and a
`## Milestone close (Discover, then Learn)` section giving the five-step close sequence.

**2. `.claude/commands/discover.md` and `.claude/commands/learn.md`** — the invocable form, following
the existing command files' shape (a `description:` front-matter key, `$ARGUMENTS`, and a numbered
procedure that defers to `specs/sdd-workflow.md` as governing).

**3. Three KMS-registered artifacts under `docs/research/`.** `README.md` states what belongs there
and, more usefully, what belongs in the roadmap, an ADR or the design system instead — the
duplication rule is the one most likely to be broken by a research directory. `discovery-log.md` and
`milestone-retrospectives.md` are append-only, newest first, each carrying its own entry template.

**4. Wiring into the existing loop.** `/document` gains a step 8 running the pair at milestone close
before the model switch and `/clear`; `/orient` gains a step reading the discovery log for open
findings touching the area about to be worked on; `CLAUDE.md` records both phases alongside the four
gates.

## The two design decisions that carry the weight

**Neither phase is a gate, deliberately.** Evidence that a merge depends on gets written to pass
rather than to be true — a retrospective that can block a release will report that everything went
well. The four SDD gates are untouched, and neither phase can fail a build.

**Neither phase produces approved scope.** Findings reach the roadmap through `/propose` and code
through `/spec`. This is not ceremony: it is the only thing standing between a permanent research
phase and an unbounded backlog of work nobody agreed to do.

A third, smaller one: **Discover runs before Learn.** A retrospective written first re-derives half
of what discovery would have surfaced and misses the rest.

## Disclosure: implementation preceded the proposal

The work was carried out at the human's direction before `#550` existed, so Gate 1 was applied
retroactively. Recording it here rather than back-dating a proposal, because a spec that reads as
though it preceded its implementation is exactly the kind of document this repo has been burned by.
What follows in `requirements.md` describes what was built and is verified against the built
artifact.

## Deliberately excluded

- **No `sdd:audit` enforcement.** A check failing when a closed milestone has no retrospective entry
  is the obvious mechanical backstop and is deliberately deferred to `#551`: the human's ruling is to
  validate the milestone-close process in practice first. A check written against a template rather
  than a real entry would encode assumptions the first real close is likely to change, and a
  wrongly-scoped check in `sdd:audit` becomes noise on every `/orient`.
- **No backfill of P8's retrospective.** A retrospective reconstructed from the change log days after
  the fact is reconstruction, not evidence — precisely what the Learn template forbids. Recorded in
  `milestone-retrospectives.md` as a deliberate absence so a later reader does not mistake it for an
  oversight. The first entry will be P9's.
- **The seeded discovery findings stay research.** `docs/research/discovery-log.md` ships carrying the
  first pass's three genuinely unowned findings — post-payment order adjustment, absent analytics
  instrumentation, and no delivery capacity ceiling. **No issue is filed for any of them under this
  slice** and none enters approved scope here. They are seeded because an empty log with a template
  demonstrates nothing about whether the format works.
- **No change to the four SDD gates**, no change to the model-switching rule, and no new npm script.
- **No research beyond the first pass.** This slice builds the phases; running them is the next
  milestone's business.

## Open items carried forward

- `#551` — the `sdd:audit` question above, to revisit once P9's close has produced one real entry.
- **`#267` still applies.** Project #2's Phase field cannot express P9, so `#550` and `#551` sit on
  the board with Phase unset. Not made worse by this slice, but worth not rediscovering.
- **`#546` still applies.** `CLAUDE.md` requires every PR to carry `phase:P_` and `gate:_` labels and
  those labels have never existed, so this slice's PR cannot carry them either.
