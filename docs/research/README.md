---
id: research-index
title: "Research & retrospectives — what lives here"
audience: [dev, product]
type: doc
status: approved
version: "1.0.0"
updated: 2026-09-02
visibility: internal
summary: "Explains what the Discover and Learn phases write into this directory, what belongs in a canonical project document instead, and the rule that nothing here is approved scope until it passes through /propose."
tags: [research, discovery, retrospective, sdd, process]
related: [sdd-workflow, roadmap, mission]
---

# Research & retrospectives — what lives here

Two SDD phases write here, and nothing else does.

| File | Written by | Holds |
| --- | --- | --- |
| `discovery-log.md` | **Discover** | Forward-looking findings: customer problems, business opportunities, UX friction, operational gaps, risks, assumptions, competitor and market observations, technical constraints. |
| `milestone-retrospectives.md` | **Learn** | Backward-looking evidence: what a completed milestone actually delivered, which assumptions held, what went wrong, what to repeat or avoid. |

Both are **append-only, newest entry first**. An entry is never rewritten to look better in
hindsight — a finding that turns out to be wrong gets a later entry saying so, with a link back.

## What does NOT belong here

This directory holds **evidence and hypotheses**. It does not hold decisions, and it must not
duplicate a document that already owns the information:

- **Architecture and technology rulings** belong in `specs/architecture.md`, `specs/tech-stack.md`
  or an ADR under `specs/decisions/`.
- **Sequencing and scope** belong in `specs/roadmap.md`.
- **Standing UI rules** belong in `docs/design-ux/design-system.md`.
- **Acceptance criteria** belong in a slice's `specs/<date-slug>/requirements.md`.
- **What actually shipped** belongs in `CHANGELOG.md` and the roadmap change log.
- **Traps worth never repeating** belong in `CLAUDE.md` — a lesson that changes how the assistant
  works every session is only durable if it is in the file that gets read every session. Record it
  in the retrospective entry *and* promote it there.

If a finding here is ever contradicted by the code, **the code wins** and the entry is superseded.

## The governance rule

Nothing in this directory is approved scope. A finding becomes work only by passing through
`/propose` (SDD Gate 1) and being sequenced into `specs/roadmap.md`. A Discover entry may
*recommend* future work or challenge an existing plan; it may never quietly change one.

Every entry ends with exactly one **next action**: `RESEARCH MORE`, `PROPOSE`,
`ADD TO ROADMAP/BACKLOG`, `READY FOR SPEC`, or `DO NOT PURSUE`.

## Writing rules for this directory

`docs/` and `specs/` Markdown is assembled into MDX and built with Nextra
(`npm run kms:assemble:internal`), a pipeline the root `lint`/`typecheck`/`test`/`build` never
runs. Two things break it and nothing else catches them:

- A bare `<` immediately followed by a digit. Write `under 1%`, or wrap the value in backticks.
- A bare pair of curly braces in prose — MDX evaluates it as a JSX expression. Wrap any code
  fragment containing them in backticks.

Research prose is unusually exposed to both, because it quotes UI labels and cites percentages.
